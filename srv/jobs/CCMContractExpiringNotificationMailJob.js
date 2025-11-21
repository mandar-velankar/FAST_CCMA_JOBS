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
                template: 'CCMContractExpiredSoonMail'
            }, {
                expiryDate: this.getReminderDate(),
                template: 'CCMContractReminderMail'
            }];
            //get all mail templates for CCM Contracts
            const mailTemplates = await this.getMailTemplates(mailRuns.map(mailRun=>mailRun.template));
            //loop over configured mailing runs: first mail expired soon + reminder mail
            for (let mailRun of mailRuns) {
                //get CCM Contracts based on mail reminder date
                let contracts = await this.getExpiringCCMContracts(mailRun.expiryDate);
                // console.dir(contracts,{ depth: null });
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
            }
        } catch (error) {
            console.error(error);
        }

        console.log('Processing reminder mails for CCM Contracts finished.');
    }
    async getExpiringCCMContracts(expiryDate) {
        console.log(`Fetching Contracts with expiry date: ${expiryDate}`);
        const { CCMContractsExpiringSoonView } = this.db.entities("ConditionContract");
        const appEnv = cfenv.getAppEnv();
        const fastUIAppHost = appEnv.url.replace('f-tndr-cag-fast-ccma-jobs-srv','fastui-app');
        const tx = this.db.tx();

        const countryCodeFullWhere = (this.countryCode && ServiceHelper.buildFullWhere('CountryCode', '=', this.countryCode)) || [];
        const extensionFullWhere = ServiceHelper.buildFullWhere('Extension', '=', true) || [];
        const expiryDateFullWhere =  (expiryDate && ServiceHelper.buildFullWhere('ExpiryDate', '=', expiryDate)) || [];
        let contracts = await tx.run(SELECT.from(CCMContractsExpiringSoonView)
                .where(countryCodeFullWhere)
                .where(extensionFullWhere)
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
        console.log(`Adding reminder mails for CCM Contracts to outbox for expiry date: ${expiryDate}`);
        console.table(mails,['CountryCode','TenderID','OfferID','Sender','Recipients','Subject','Sent']);
        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
        try {
            return fastbackendAPI.send({
                method: 'POST',
                path: `/v2/conditioncontracting/OutgoingMails`,
                data: mails
            });
        } catch (error) {
            console.error(error);
            throw error;
        }
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
        date.setDate(date.getDate() + 1);//Set 5 days in PROD
        return this.formatDate(date);
    }
    getExpiringSoonDate() {
        let date = new Date();
        date.setDate(date.getDate() + 3);//Set 45 days in PROD
        return this.formatDate(date);
    }
    formatDate(date) {
        let month = '' + (date.getMonth() + 1);
        let day = date.getDate();
        month = month.length < 2 ? `0${month}` : month;
        day = day.length < 2 ? `0${day}` : day;
        return `${date.getFullYear()}-${month}-${day}`;
    }
    dateToDDMMYYYY(dateStr) {
        var d = dateStr.substr(0,4);
        var m = dateStr.substr(5,2);
        var y = dateStr.substr(8,2);
        return `${d}-${m}-${y}`;
      }
};

module.exports = CCMContractExpiringNotificationMailJob;