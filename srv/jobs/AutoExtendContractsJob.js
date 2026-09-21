const cds = require('@sap/cds');
// const BaseCron = require('cron-es6');
const BaseJob = require('./BaseJob');
const axios = require('axios');
const qs = require("qs");
const cfenv = require("cfenv");
const Handlebars = require("handlebars");
module.exports = class AutoExtendContractsJob extends BaseJob {

     constructor(jobName, jobTime) {
        super(jobName, jobTime);
    }

     /**
     * Triggered when job has started
     */
    //override
    async onTick() {

        console.log('Update expiry date started ...');

        try {
            this.db = await cds.connect.to('db'); 

            // 1. Fetch contracts to be extended
            const contracts = await this.getContractsToExtend();
            if (contracts.length === 0) {
                console.log("No contracts need extension today.");
                return;
            }

            const extendedContractsInfo = [];

            for (const contract of contracts) {

                let newEndDate = this.calculateNewEndDate(contract);
                if (!newEndDate) continue;

                // 2a. Synchronize contract with SAP
                await this.updateExistingContract(contract, newEndDate);

                // Save the sync result for later
                extendedContractsInfo.push({
                    ID: contract.ID,
                    ContractNumber: contract.ContractNumber,
                    NewEndDate: newEndDate,
                    CountryCode: contract.CountryCode
                });

                // 3. Update contract end date in DB
                await this.persistNewEndDate(contract.ID, newEndDate);
            }

            const extendedContracts = await this.loadExtendedContractDetails(extendedContractsInfo.map(c => c.ID));
            
            console.log('Processing mails for Extend Expiry Contracts started ...');  
            
            const templateId = 'ContractExtendExpiryMail';
            const mailTemplate = await this.getMailTemplate(templateId);   

            if (extendedContracts && extendedContracts.length > 0) {
                let mail = this.mapDataToMail(mailTemplate,extendedContracts);
                
                if(mail){
                    await this.addMailsToOutbox(mail);
                } else{
                    console.log(`No mails Need to send ${templateId}`);
                }
            } else {
                console.log(`No expired mails to be send for expiry date: ${mailRun.expiryDate}`);
            }

            console.log('Processing Extend Expiry mails for Contracts Completed');
 
        } catch (error) {
            this.logError(error);
            console.log(error);
        }

        // when the job has finished, call the stop()
        // this will trigger onComplete method
        // this.stop();
        console.log('Updating expiry dates finished.');
    }

    async updateExistingContract(contract, newEndDate) {

        const expiryDate = newEndDate;
        const contractNumber = contract.ContractNumber;

        const {response, body} = await this.handlExistingContract('ES',"ConditionContract",{ExistingContractNumber: contractNumber,ExpireDate: expiryDate});

        //console.log(response);
        if (response?.status !== 200) {
            const error = new Error(
                `Update of ExistingContract failed for ${contractNumber}`
            );
            error.payload = body;
            error.ContractNumber = contractNumber;
            throw error;
        }

        console.log(`Existing contract ${contractNumber} updated successfully`);

        return true;
    }

    async persistNewEndDate(id, newEndDate) {
        const { CCMContract } = this.db.entities("com.bayer.SXTENDER.ccma");
        const tx = this.db.tx();
        await tx.run(UPDATE(CCMContract).set({ CCMContractEndDate: newEndDate, Expired: false }).where({ ID: id }));
        await tx.commit();

    }

    async handlExistingContract(countryCode, resource, sourceData) {
        this.db = await cds.connect.to('db');
        const tx = this.db.tx();
        const { APIDefinition, APIBody, APIConfigOAuth } = this.db.entities("com.bayer.SXTENDER.ccma");

        const apiConfig = await tx.run(SELECT.one.from(APIDefinition).where({ Provider: 'ConditionContract', CountryCode: countryCode, Resource: resource, Name: 'UpdateExistingInvoiceContract' }));
        const apiBodyMappings = await tx.run(SELECT.from(APIBody).where({ APIDefinition_ID: apiConfig.ID }));
        
        if (!apiBodyMappings) {
            throw new Error("ERR_MISSING_PARAMETER:API body Mappings not found");
        }
        const body = this.buildExistingUpdatePayloadFromMappings(sourceData, apiBodyMappings);
        
        if (!body) {
            throw new Error("ERR_MISSING_PARAMETER:API Body not found");
        }

        console.log("payload" + JSON.stringify(body));
        const oauthAuth = await tx.run(SELECT.one.from(APIConfigOAuth, apiConfig.OAuth_ID));
        const url = `${apiConfig.Host}${apiConfig.BasePath}${apiConfig.ResourcePath}`;

        const oauthCredentials = await this.getBearerToken(oauthAuth);

        const response = await axios({
            method: 'patch',
            url: url,
            headers: {
                'Authorization': `Bearer ${oauthCredentials.data.access_token}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(body)
        });

        return {response, body};

    }

    async getBearerToken(oauthAuth) {

        if (oauthAuth.OAuthProvider && oauthAuth.ClientID && oauthAuth.ClientSecret && oauthAuth.Scope) {

            return axios({
                method: 'post',
                url: oauthAuth.OAuthProvider,
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${oauthAuth.ClientID}:${oauthAuth.ClientSecret}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept-Encoding': 'gzip, deflate',
                    'accept': 'application/json'
                },
                data: qs.stringify({
                    'grant_type': oauthAuth.GrantType,
                    'scope': oauthAuth.Scope
                })/*, when testing locally, comment out the proxy
                    proxy: {
                        host: priceAgreementApi.ProxyHost,
                        port: priceAgreementApi.ProxyPort
                    }*/
            });
        }

        throw Error("Missing OAUTH config parameters");
    };

    buildExistingUpdatePayloadFromMappings(sourceData, apiBodyMappings) {
        const finalResult = {};

        for (const { Target } of apiBodyMappings) {

            if (Target.endsWith("ConditionContract.ConditionContractType.ConditionContract")) {
                this.setNestedValue(finalResult, Target, sourceData.ExistingContractNumber);
                continue;
            }

            if (Target.endsWith("ConditionContract.ConditionContractType.CndnContrValidTo")) {
                this.setNestedValue(finalResult, Target, sourceData.ExpireDate);
                continue;
            }

            this.setNestedValue(finalResult, Target, "");

        }

        return finalResult;
    }

    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;

        keys.forEach((key, index) => {
            if (index === keys.length - 1) {
                current[key] = value;
            } else {
                if (!current[key]) current[key] = {};
                current = current[key];
            }
        });
    }

    async getContractsToExtend() {
        this.db = await cds.connect.to('db');
        const { CCMContract } = this.db.entities("com.bayer.SXTENDER.ccma");
        const tx = this.db.tx();
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateY = yesterday.toISOString().split('T')[0];

        const result = await tx.run(SELECT.from(CCMContract).where({ Extension: true, Cancelled: false }));

        return result.filter(c => c.CCMContractEndDate === dateY);

    }

    calculateNewEndDate(contract) {
        if (!contract.CCMContractEndDate) return null;

        const d = new Date(contract.CCMContractEndDate);
        const months = Number(contract.ExtensionPeriod) || 0;

        d.setMonth(d.getMonth() + months);
        return d.toISOString().split("T")[0];
    }

    async getMailTemplate(templateId) {
        console.log('Get mail templates');
        console.table(templateId);
        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
        try{
            const result = await fastbackendAPI.send({
                method: 'GET',
                path: `/v2/conditioncontracting/MailTemplate(CountryCode='ES',Language='ES',TemplateId='${templateId}')?$expand=MailTemplateFile&$select=MailTemplateFile.content`
            });
            return result;
        }catch(error){
            console.error("No mail template found");
            return;
        }
    }

    async addMailsToOutbox(mails) {
        if (!Array.isArray(mails) || mails.length === 0) {
            return [];
        }

        console.log(`Adding Extend Expiry mails for Price Agreements to outbox`);
        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
        // const mailTemplate = await getMailTemplate(api, templateId);
        // const mappedData = mappingCB(mailTemplate?.d, data, subject, recipients);
        const MAX_MAILS_PER_BATCH = 3;
        const batches = [];

        for (let i = 0; i < mails.length; i += MAX_MAILS_PER_BATCH) {
            batches.push(mails.slice(i, i + MAX_MAILS_PER_BATCH));
        }

        const CONCURRENCY = 3;
        const results = [];

        for (let i = 0; i < batches.length; i += CONCURRENCY) {
            const group = batches.slice(i, i + CONCURRENCY);

            const groupResults = await Promise.all(
                group.map(batch =>
                    this.sendMailBatch(fastbackendAPI, batch)
                )
            );

            results.push(...groupResults.flat());
        }

        return results;
    }

    async sendMailBatch(fastbackendAPI, batch) {
        try {
            const result = await fastbackendAPI.send({
                method: 'POST',
                path: '/v2/conditioncontracting/OutgoingMails',
                data: batch
            });

            return [result];
        } catch (error) {
            const status =
                error?.reason?.response?.status ??
                error?.response?.status;

            if (status === 413) {
                if (batch.length === 1) {
                    throw error;
                }

                const middle = Math.ceil(batch.length / 2);
                const left = batch.slice(0, middle);
                const right = batch.slice(middle);

                const [leftResult, rightResult] = await Promise.all([
                    this.sendMailBatch(fastbackendAPI, left),
                    this.sendMailBatch(fastbackendAPI, right)
                ]);

                return [
                    ...leftResult,
                    ...rightResult
                ];
            }

            throw error;
        }
    }
 
    async loadExtendedContractDetails(contractsIds) {
        console.log(`Fetching Extended Contract Details`);
        this.db = await cds.connect.to('db');
        const { CCMContractsExtendedView } = this.db.entities("ConditionContract");
        const appEnv = cfenv.getAppEnv();
        const fastUIAppHost = (appEnv && appEnv.url) ? appEnv.url.replace('f-tndr-cag-fast-ccma-jobs-srv', 'fastui-app') : '';
        const tx = this.db.tx();
        let contracts = await tx.run(SELECT.from(CCMContractsExtendedView).where({ CCMContractID: {in: contractsIds}}));
        console.log(`Fetched ${JSON.stringify(contracts)} Extended Contracts`);
        return contracts.map(contract => {                
            contract.FormatedExpiryDate = this.dateToDDMMYYYY(contract.ExpiryDate);
            contract.URL = `${fastUIAppHost}/app/index.html#/conditioncontract&/ccma/detail/${contract.CCMContractID}`
            return contract;
        })
    };
 
    mapDataToMail(template,data){

        let outbox = [];
        const uniqueUsers = [...new Set(data.map(item => item.OfferID))];
        const base64Content = template?.d?.MailTemplateFile?.content;
        const templateContent = base64Content ? Buffer.from(base64Content, 'base64') : null;
        
         for (let user of uniqueUsers) {

            let dataFilteredByUser = data.filter(d => d.OfferID === user);
            

            if(dataFilteredByUser && dataFilteredByUser.length > 0){
                outbox.push({
                    CountryCode: dataFilteredByUser[0].CountryCode,
                    TenderID: dataFilteredByUser[0].TenderID,
                    OfferID: dataFilteredByUser[0].OfferID,
                    Sender: 'FAST-Admin@bayer.com',
                    Recipients:dataFilteredByUser[0].UserEmail,
                    Subject: template?.d?.MailTemplateFile?.title,
                    MailBody: this.generateMailBody(templateContent, {
                        data: {
                            FormatedExpiryDate :this.dateToDDMMYYYY(dataFilteredByUser[0].ExpiryDate),
                            CCMContracts: dataFilteredByUser 
                        }
                    }),
                      Sent: false
                });
                
            }
        }
        outbox.push({
            CountryCode: data[0].CountryCode,
            TenderID: data[0].TenderID,
            OfferID: data[0].OfferID,
            Sender: 'FAST-Admin@bayer.com',
            Recipients: undefined,
            Subject: template?.d?.MailTemplateFile?.title,
            MailBody: this.generateMailBody(templateContent, { 
                data: { 
                    SyncDate: syncDate.toDateString(), 
                    CCMContracts: data 
                }
            }),
            Sent: false
        });
        
        if(!outbox || (!outbox[0].MailBody || outbox[0].MailBody === 'undefined')) {
            console.log(`No template found for Auto Extend Contracts ${outbox[0].TenderID} with countrycode ${outbox[0].CountryCode}`);
            return;
        }
        return outbox;
      
    }
 
    generateMailBody(content, data) {       
        return Handlebars.compile("" + content)(data);
    };

    dateToDDMMYYYY(dateStr) {
        var d = dateStr.substr(0,4);
        var m = dateStr.substr(5,2);
        var y = dateStr.substr(8,2);
        return `${d}-${m}-${y}`;
    }

    async logError(err) {
        cds.spawn(async (tx) => {
            const { ConditionContractsLog } = this.db.entities("com.bayer.SXTENDER.ccma");
            const inserts = {            
                PayloadToSAP      : err.config.data || JSON.stringify(err.config.data), 
                createdAt         : new Date().toISOString(),
                ErrorMessage     : err.response?.data?.fault?.faultstring || err.stack || err.message,
                PayloadType: 'AutoExtendContractsJob'
            }
            await tx.run(INSERT.into(ConditionContractsLog).entries(inserts));
        })
    }
 
};
