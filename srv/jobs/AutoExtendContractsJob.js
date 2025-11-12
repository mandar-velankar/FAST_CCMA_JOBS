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
            let contractsIds = await this.updateContractsExpiration();

            await this.updateExistingContract(contractsIds);

            console.log('Processing mails for Extend Expiry Contracts started ...');
 
            const templateId = 'ContractExtendExpiryMail';
            const mailTemplate = await this.getMailTemplate(templateId);

            let extendedContracts = await this.getContractsExtended(contractsIds);                 

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
            console.log(error);
        }

        // when the job has finished, call the stop()
        // this will trigger onComplete method
        // this.stop();
        console.log('Updating expiry dates finished.');
    }

    async updateExistingContract(contractsIds) {
        const tx = cds.tx();

        const { CCMContract } = this.db.entities("com.bayer.SXTENDER.ccma");

        let contracts = await tx.run(SELECT.from(CCMContract).where({ ID: {in: contractsIds}}));

        contracts.forEach(async contract => {
            const expiryDate = contract.CCMContractEndDate;
            const contractNumber = contract.ContractNumber;

            const response = await this.handlExistingContract('ES',"ConditionContract",{ExistingContractNumber: contractNumber,ExpireDate: expiryDate});

            console.log(response);
            if (response?.status !== 200) {
                throw new Error(`Update of ExistingContract failed for ${contractNumber}`);
            }

            console.log(`Existing contract ${contractNumber} updated successfully`);
        });
       

        return true;
    }

    async handlExistingContract(countryCode, resource, sourceData) {
        const tx = cds.tx();
        try {
            const { APIDefinition, APIBody, APIConfigOAuth } = this.db.entities('com.bayer.SXTENDER.ccma');
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
            console.log("url and oauthAuth"+ url + JSON.stringify(oauthAuth));
            const oauthCredentials = await this.getBearerToken(oauthAuth);
            return axios({
                method: 'patch',
                url: url,
                headers: {
                    'Authorization': `Bearer ${oauthCredentials.data.access_token}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(body)
            });
        } catch (error) {
            throw error
        }
    }

    async getBearerToken(oauthAuth) {

        if (oauthAuth.OAuthProvider && oauthAuth.ClientID && oauthAuth.ClientSecret && oauthAuth.Scope) {
            console.log(`Calling ${oauthAuth.OAuthProvider}`);
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

    async updateContractsExpiration(){
        const tx = cds.tx();
        try {

            const { CCMContract } = this.db.entities("com.bayer.SXTENDER.ccma");

            //get all contracts which have to be extended
            //first, calculate todays date - 1 day, as such that we can use this as a filter in our select


            const whereExpr = `Extension = true and Cancelled = false` //and expiry date is today - 1 
            const ccmContracts = await tx.run(SELECT.from(CCMContract).where(whereExpr));

            let contractsIds = [];
            const promises = [];
            
            ccmContracts.forEach(contract => {
                let todayMinus1 = new Date();
                todayMinus1.setDate(todayMinus1.getDate() - 1);
                todayMinus1 = todayMinus1.toISOString().split('T')[0];
                if(!contract.CCMContractEndDate){
                    console.log(`AgreementID ${contract.ID}:Expiry date ${contract.CCMContractEndDate} is not valid, will not be processed...`);
                    return;
                }

                let contractExpiryDate = contract.CCMContractEndDate;

                if(contractExpiryDate === todayMinus1){
                    let newDate = new Date(contract.CCMContractEndDate);
                    let extensionMonths = Number(contract.ExtensionPeriod) || 0;
                    newDate.setMonth(newDate.getMonth()+ extensionMonths);
                    newDate = newDate.toISOString().split('T')[0];
                    contractsIds.push(contract.ID);

                    //update the actual contract with the new contract end date
                    promises.push(tx.run(UPDATE(CCMContract).with({CCMContractEndDate: newDate}).where({ ID: contract.ID })));
                }
            });

            //execute the promises and log the output
            if(promises.length > 0){
                console.log(`Updating ${CCMContract.name} ...`);
                await Promise.all(promises);
                await tx.commit();
                console.log(`${promises.length} Expiry date(s) successfully updated in ${CCMContract.name}.`);
            }
            
            return contractsIds;

        } catch (error) {
            console.log('Updating expiry dates has failed.');
            console.log(error);
            await tx.rollback(error);
        }   
    };

    addLeadingZeros (num, size) {
        if (num === null) {
            throw new Error(`${num} doesn't exist`);
        }
        
        num = num.toString();
        while (num.length < size) num = "0" + num;
        return num;
    };

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

    async addMailsToOutbox(mail) {
        console.log(`Adding Extend Expiry mails for Price Agreements to outbox`);
        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
        // const mailTemplate = await getMailTemplate(api, templateId);
        // const mappedData = mappingCB(mailTemplate?.d, data, subject, recipients);
        return fastbackendAPI.send({
            method: 'POST',
            path: `/v2/conditioncontracting/OutgoingMails`,
            data: mail
        });
    }
 
    async getContractsExtended(contractsIds) {
        console.log(`Fetching Extended Contract Details`);
        const { CCMContractsExtendedView } = this.db.entities("ConditionContract");
        const appEnv = cfenv.getAppEnv();
        const fastUIAppHost = (appEnv && appEnv.url) ? appEnv.url.replace('fast-srv', 'fastui-app') : '';
        const tx = this.db.tx();
        let contracts = await tx.run(SELECT.from(CCMContractsExtendedView).where({ CCMContractID: {in: contractsIds}}));
        //let contracts = await SELECT.from(FastConditionContracts);        
        //await tx.commit();
        console.log(`Fetched ${JSON.stringify(contracts)} Extended Contracts`);
        return contracts.map(contract => {                
            contract.FormatedExpiryDate = this.dateToDDMMYYYY(contract.CCMContractEndDate);
            contract.URL = `${fastUIAppHost}/app/index.html#/conditioncontract&/ccma/detail/${contract.ID}`
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
 
    // findTemplate(templates, templateid, dataItem) {
    //     if (!templates || !Array.isArray(templates)) {
    //         return null;
    //     }
    //     return templates.find(template =>
    //         template.CountryCode === 'ES' &&
    //         template.Language === 'ES' &&
    //         template.TemplateId === templateid);
    // };
};
