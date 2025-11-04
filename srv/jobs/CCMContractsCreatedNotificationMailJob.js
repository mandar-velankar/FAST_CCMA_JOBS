const cds = require('@sap/cds');
const BaseJob = require('./BaseJob');
const Handlebars = require("handlebars");
const cfenv = require("cfenv");
const { tryCatch } = require('ramda');

module.exports = class CCMContractsCreatedNotificationMailJob extends BaseJob {

    constructor(jobName, jobTime) {
        super(jobName, jobTime);
    }

    /**
     * Triggered when job has started
     */
    //override
    async onTick() {

        const syncDate = new Date();
        console.log(`Processing notification mail for CCM Contracts synchronised with SAP on ${syncDate.toDateString()} STARTED ... `);

        try {
            this.db = await cds.connect.to('db');
            

            // get mail Template
            const templateId = 'CCMContractsCreatedNotificationMail';
            const mailTemplate = await this.getMailTemplate(templateId);

            //get customer prices
            const synchronizedAggregatedData = await this.getSynchronizedCCMContractsData(syncDate);

            // console.dir(pas,{ depth: null });
            if (synchronizedAggregatedData && synchronizedAggregatedData.length > 0) {
                let mail = this.mapDataToMail(mailTemplate,templateId, syncDate)(synchronizedAggregatedData);
                // console.log(mails);
                if(mail){
                    await this.addMailsToOutbox(mail, syncDate);
                } else{
                    console.log(`No mail to add to outbox for template ${templateId}`);
                }
             } else {
                 console.log(`No notification mail to be send on ${syncDate.toDateString()}`);
             }
        } catch (error) {
            console.error(error);
        }

        console.log(`Processing notification mail for CCM Contracts synchronised with SAP on ${syncDate.toDateString()} FINISHED`);
    }

    /**
     * Fetch Customer Prices which are synchronized but not yet notified.
     * Price Agreement and Tender data is aggregated.
     * @param {Date} date 
     * @returns {Array<Objects>}  A list of aggregated data
     */
    async getSynchronizedCCMContractsData(date) {
        console.log(`Fetching Contracts synchronized on ${date.toDateString()}`);
        const {CCMContractsCreatedNotificationMailJobView} = this.db.entities('ConditionContract');
        let pas = await SELECT.from(CCMContractsCreatedNotificationMailJobView).where({ContractCreationDate: { '>=': date.toJSON().substring(0,10)}}); // only consider records synced on the day this job runs   
        return pas;
    }

    mapDataToMail = (template,mail,syncDate) => data => {
        const appEnv = cfenv.getAppEnv();
        const fastUIAppHost = appEnv.url.replace('fast-srv','fastui-app');
        let outbox = [];
        // add/change some fields in the data array
        data.forEach(d => {
            d.EffectiveDate = new Date(d.EffectiveDate).toJSON().substring(0,10),
            d.ExpiryDate = new Date(d.ExpiryDate).toJSON().substring(0,10),
            d.URL = `${fastUIAppHost}/app/index.html#/conditioncontract&/ccma/detail/${d.CCMContractID}`
        })

        //get unique created by users, this can be used to filter pa/cp data per user from the data array
        const uniqueUsers = [...new Set(data.map(item => item.Owner))];

        for (let user of uniqueUsers) {
            let dataFilteredByUser = data.filter(d => d.CWID == user);
            if(dataFilteredByUser && dataFilteredByUser.length > 0){
                outbox.push({
                    CountryCode: dataFilteredByUser[0].CountryCode,
                    TenderID: dataFilteredByUser[0].TenderId,
                    OfferID: dataFilteredByUser[0].OfferId,
                    Sender: 'FAST-Admin@bayer.com',
                    Recipients: dataFilteredByUser[0].UserEmail,
                    Subject: template.title,
                    MailBody: this.generateMailBody(template, { 
                        data: { 
                            SyncDate: syncDate.toDateString(), 
                            CustomerPrices: dataFilteredByUser 
                        }
                    }),
                    Sent: false
                });
            }
        }
        outbox.push({
            CountryCode: data[0].CountryCode,
            TenderID: data[0].TenderId,
            OfferID: data[0].OfferId,
            Sender: 'FAST-Admin@bayer.com',
            Recipients: undefined,
            Subject: template.title,
            MailBody: this.generateMailBody(template, { 
                data: { 
                    SyncDate: syncDate.toDateString(), 
                    CustomerPrices: data 
                }
            }),
            Sent: false
        });
        
        if(!outbox || (!outbox[0].MailBody || outbox[0].MailBody === 'undefined')) {
            console.log(`No template found for Customer Price of tender ${outbox[0].TenderID} with countrycode ${outbox[0].CountryCode}`);
            return;
        }
        return outbox;
    }

    async addMailsToOutbox(mail, syncDate) {
        console.log(`Adding notification mail for CCM Contracts synchronised with SAP on: ${syncDate.toDateString()}`);
        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
		// const mailTemplate = await getMailTemplate(api, templateId);
		// const mappedData = mappingCB(mailTemplate?.d, data, subject, recipients);
		return fastbackendAPI.send({
            method: 'POST',
            path: `/v2/conditioncontracting/OutgoingMails`,
            data: mail
        });
	}

    generateMailBody(mail, data) {
        return Handlebars.compile("" + mail.content)(data);
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
            // const result = await fastbackendAPI.send({
            //     query: SELECT.one.from("ConditionContractService.MailTemplate")
            //     .columns('*', 'MailTemplateFile.title', 'MailTemplateFile.content')
            //     .where({ TemplateId: templateId })
            // })
            // const result = await fastbackendAPI.run(SELECT.one.from(MailTemplate)
			// .columns('*', 'MailTemplateFile.title', 'MailTemplateFile.content')
			// .where({ TemplateId: templateId }))
            return result;
        }catch(error){
            console.error("No mail template found");
            return;
        }
        // return tx.run(SELECT.one.from(MailTemplate)
        //     .columns('*', 'MailTemplateFile.title', 'MailTemplateFile.content')
        //     .where({ TemplateId: templateId }));
    }
};
