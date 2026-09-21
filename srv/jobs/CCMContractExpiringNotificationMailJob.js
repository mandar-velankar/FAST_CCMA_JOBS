const cds = require('@sap/cds');
const BaseJob = require('./BaseJob');
const Handlebars = require("handlebars");
const cfenv = require("cfenv");
const ServiceHelper = require('../utils/ServiceHelper');

class CCMContractExpiringNotificationMailJob extends BaseJob {

    constructor(jobName, jobTime) {
        super(jobName, jobTime);
    }

    /**
     * Triggered when job has started
     */
    //override
    async onTick() {

        console.log('Processing reminder mails for CCM Contracts started ...');

        try {
            this.db = await cds.connect.to('db');
            this.countryCode = "ES";
            const mailRuns = [{
                expiryDate: this.getExpiringSoonDate(),
                template: 'CCMContractExpiredSoonMail',
                markExpiringSoon: true
            }, {
                expiryDate: this.getReminderDate(),
                template: 'CCMContractReminderMail',
                markExpiringSoon: false
            }];
            //get all mail templates for CCM Contracts
            const mailTemplates = await this.getMailTemplates(mailRuns.map(mailRun=>mailRun.template));
            //loop over configured mailing runs: first mail expired soon + reminder mail
            for (let mailRun of mailRuns) {
                console.log(`Processing for expiry date ${mailRun.expiryDate} with template ${mailRun.template} started ...`);
                //get CCM Contracts based on mail reminder date
                let contracts = await this.getExpiringCCMContracts(mailRun.expiryDate);
                // console.dir(contracts,{ depth: null });
                if (mailRun.markExpiringSoon) {
                    await this.markFastContractsAsExpiringSoon(contracts);
                }
                if (contracts && contracts.length > 0) {
                    let mails = this.mapCCMContractsToMails(mailTemplates,mailRun.template)(contracts);
                    // console.log(mails);
                    if(mails && mails.length > 0){
                        await this.addMailsToOutbox(mails, mailRun.expiryDate);
                    } else{
                        console.log(`No mails to add to outbox for template ${mailRun.template}`);
                    }
                } else {
                    console.log(`No reminder mails to be send for expiry date: ${mailRun.expiryDate}`);
                }
                console.log(`Processing for expiry date ${mailRun.expiryDate} with template ${mailRun.template} finished ...`);
            }
        } catch (error) {
            console.error(error);
        }

        console.log('Processing reminder mails for CCM Contracts finished.');
    }
    async getExpiringCCMContracts(expiryDate) {
        console.log(`Fetching Contracts with expiry date: ${expiryDate} started ...`);
        const { CCMContractsExpiringSoonView } = this.db.entities("ConditionContract");
        const appEnv = cfenv.getAppEnv();
        const fastUIAppHost = appEnv.url.replace('f-tndr-cag-fast-ccma-jobs-srv','fastui-app');
        const tx = this.db.tx();

        const countryCodeFullWhere = (this.countryCode && ServiceHelper.buildFullWhere('CountryCode', '=', this.countryCode)) || [];
        const expiryDateFullWhere =  (expiryDate && ServiceHelper.buildFullWhere('ExpiryDate', '=', expiryDate)) || [];
        let contracts = await tx.run(SELECT.from(CCMContractsExpiringSoonView)
                .where(countryCodeFullWhere)
                .where(expiryDateFullWhere));

        return contracts.map(contract => {
            contract.Price = contract.PVL ? contract.PVL : 0;
            contract.FormattedExtendCCMContract = contract.Extension ? 'Yes' : 'No';
            contract.ShowExpiryExtensionPeriod = false;
            if(contract.ExtensionPeriod && contract.ExtensionPeriod > 0){
                contract.ShowExpiryExtensionPeriod = true;
            }
            contract.FormatedExpiryDate = this.dateToDDMMYYYY(contract.ExpiryDate);
            contract.URL = `${fastUIAppHost}/app/index.html#/conditioncontract&/ccma/detail/${contract.FastConditionContractID}/detail-detail/${contract.CCMContractID}/${contract.ProductCode}/ThreeColumnsMidExpanded`
            return contract;
        })
        console.log(`Fetching Contracts with expiry date: ${expiryDate} finished ...`);
    }
    mapCCMContractsToMails = (templates,mail) => contracts => contracts
        .map(contract => ({
            CountryCode: contract.CountryCode,
            TenderID: contract.TenderID,
            OfferID: contract.OfferID,
            Sender: 'FAST-Admin@bayer.com',
            Recipients: contract.OwnerEmail,
            Subject: this.findTemplate(templates,mail,contract)?.title,
            MailBody: this.generateMailBody(this.findTemplate(templates,mail,contract), contract),
            Sent: false
        }))
        .filter(contract =>{
            if(!contract.MailBody || contract.MailBody === 'undefined')console.log(`No template found for CCM Contract of tender ${contract.TenderID} with countrycode ${contract.CountryCode}`)
            return !!contract.MailBody && contract.MailBody !== 'undefined';
        });

    findTemplate = (templates,templateid,contract) => {
        const template = templates.find(template => 
        template.CountryCode === contract.CountryCode && 
        template.Language === contract.CountryCode && 
        template.TemplateId === templateid);

        if (!template) return {};
        return template.MailTemplateFile;
    };

    async addMailsToOutbox(mails, expiryDate) {
        if (!Array.isArray(mails) || mails.length === 0) {
            return [];
        }

        console.log(`Adding reminder mails for CCM Contracts to outbox for expiry date: ${expiryDate}`);
        console.table(mails,['CountryCode','TenderID','OfferID','Sender','Recipients','Subject','Sent']);
        const fastbackendAPI = await cds.connect.to('FASTBACKEND_API');

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
    generateMailBody(mail, data) {
        //CountryCode: language, Language: language, 
        return Handlebars.compile("" + mail?.content)(data);
    }
    async getMailTemplates(templateIds) {
        console.log('Get mail templates for CCM Contracts');
        console.table(templateIds);

        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
        try{
            const result = await fastbackendAPI.send({
                method: 'GET',
                path: `/v2/conditioncontracting/MailTemplate?$expand=MailTemplateFile&$select=MailTemplateFile.content&$filter=CountryCode eq '${this.countryCode}' and Language eq '${this.countryCode}' and (TemplateID eq '${templateIds[0]}' or TemplateID eq '${templateIds[1]}')`
            });
            const data = result?.d;
            const templates = Object.keys(data)
                .filter(key => !isNaN(key))       // keep only numeric keys
                .map(key => data[key])
                .map(key => {
                    key.MailTemplateFile.content = key.MailTemplateFile.content ? Buffer.from(key.MailTemplateFile.content, 'base64') : null;
                    return key;
                });
            return templates;
        }catch(error){
            console.error("No mail template found");
            return [];
        }
            // return tx.run(SELECT.from(MailTemplate)
            //     .columns('*', 'MailTemplateFile.title', 'MailTemplateFile.content')
            //     .where({ TemplateId: { in: templateIds } }));
    }
    getReminderDate() {
        let date = new Date();
        date.setDate(date.getDate() + 5);//Set 5 days in PROD
        return this.formatDate(date);
    }
    getExpiringSoonDate() {
        let date = new Date();
        date.setDate(date.getDate() + 45);//Set 45 days in PROD
        return this.formatDate(date);
    }
    formatDate(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${date.getFullYear()}-${month}-${day}`;
    }
    dateToDDMMYYYY(dateStr) {
        var d = dateStr.substr(0,4);
        var m = dateStr.substr(5,2);
        var y = dateStr.substr(8,2);
        return `${d}-${m}-${y}`;
      }

    async markFastContractsAsExpiringSoon(contracts) {
        console.log(`Updating Expiring Soon Fast Condition Contrats Started`);
        const { FastConditionContracts } = this.db.entities("com.bayer.SXTENDER.ccma");
        const tx = this.db.tx();

        const fastContractIds = contracts.map(c => c.FastConditionContractID);

        if (fastContractIds.length === 0) {
            console.log(`No Expiring Soon Fast Condition Contracts to update`);
            return;
        }

        for (const fastContractId of fastContractIds) {
            await tx.run(UPDATE(FastConditionContracts).with({ hasExpiringSoonContracts: true }).where({ID: fastContractId}));
        }
        await tx.commit();
        console.log(`Updating Expiring Soon Fast Condition Contrats Finished`);
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
};

module.exports = CCMContractExpiringNotificationMailJob;