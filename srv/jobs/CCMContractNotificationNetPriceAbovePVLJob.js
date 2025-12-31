const cds = require('@sap/cds');
const BaseJob = require('./BaseJob');
const Handlebars = require("handlebars");
const cfenv = require("cfenv");
const { tryCatch } = require('ramda');
const ServiceHelper = require('../utils/ServiceHelper');


module.exports = class CCMContractNotificationNetPriceAbovePVLJob extends BaseJob {

    constructor(jobName, jobTime) {
        super(jobName, jobTime);
    }

    /**
     * Triggered when job has started
     */
    //override
    async onTick() {
        const syncDate = new Date();
        console.log(`Processing notification mail for Net Price Above PVL on ${syncDate.toDateString()} STARTED ... `);

        try {
            this.db = await cds.connect.to('db');
            this.countryCode = "ES";

            // get mail Template
            const templateName = 'CCMContractNotificationNetPriceAbovePVLMail';
            const mailTemplate = await this.getMailTemplate(templateName);

            //get contracts
            let synchronizedAggregatedData = await this.getAggregatedDataQuery();

            if (synchronizedAggregatedData && synchronizedAggregatedData.length > 0) {
                let mail = this.mapDataToMail(mailTemplate,templateName, syncDate)(synchronizedAggregatedData);
                if(mail){
                    await this.addMailsToOutbox(mail, syncDate);
                } else{
                    console.log(`No mail to add to outbox for template ${templateName}`);
                }
             } else {
                 console.log(`No notification mail to be send on ${syncDate.toDateString()}`);
             }
        } catch (error) {
            console.error(error);
        }

        console.log(`Processing notification mail for Net Price Above PVL on ${syncDate.toDateString()} FINISHED`);
    }

    /**
     * Fetch Customer Prices which are synchronized but not yet notified.
     * Price Agreement and Tender data is aggregated.
     * @param {Date} date 
     * @returns {Array<Objects>}  A list of aggregated data
     */
    getAggregatedDataQuery() {
        console.log(`Build query for Aggregated Data for net prices above pvl`);

        const {
            CCMContractPriceChangeNotificationView
        } = cds.entities('ConditionContract');

        return SELECT.from(CCMContractPriceChangeNotificationView)
            .where({
                CountryCode: this.countryCode, 
                hasNetPriceAbovePVL: true, 
                isCancelled: false,
                isExpired: false
            });
    }

    mapDataToMail = (template,mail,syncDate) => data => {
        const appEnv = cfenv.getAppEnv();
        const fastUIAppHost = appEnv.url.replace('f-tndr-cag-fast-ccma-jobs-srv','fastui-app');
        let outbox = [];
        // add/change some fields in the data array
        data = data.filter(d => d.ConditionType === 'PrecioNeto');
        data.forEach(d => {
            d.PvlOld = d.PVL,
            d.PvlNew = d.CurrentPVL,
            d.NetPrice = d.NetPrice,
            d.ConditionType = d.ConditionType,
            d.CustomerID = d.CustomerID,
            d.InstituteName = d.InstituteName,
            d.MaterialNumber = d.MaterialNumber,
            d.PRODUCTPACKNAME = d.ProductName,
            d.URL = `${fastUIAppHost}/app/index.html#/conditioncontract&/ccma/detail/${d.FastConditionContractID}/detail-detail/${d.CCMContractID}/${d.ProductCode}/ThreeColumnsMidExpanded`
        })

        //get unique created by users, this can be used to filter pa/cp data per user from the data array
        const uniqueUsers = [...new Set(data.map(item => item.OwnerEmail))];

        for (let user of uniqueUsers) {
            let dataFilteredByUser = data.filter(d => d.OwnerEmail === user);
            if(dataFilteredByUser && dataFilteredByUser.length > 0){
                outbox.push({
                    CountryCode: dataFilteredByUser[0].CountryCode,
                    TenderID: dataFilteredByUser[0].TenderID,
                    OfferID: dataFilteredByUser[0].OfferID,
                    Sender: 'FAST-Admin@bayer.com',
                    Recipients: dataFilteredByUser[0].OwnerEmail,
                    Subject: template?.MailTemplateFile?.title,
                    MailBody: this.generateMailBody(template?.MailTemplateFile, {
                        data: { 
                            SyncDate: syncDate.toDateString(), 
                            OwnerName: dataFilteredByUser[0].OwnerName,
                            Contracts: dataFilteredByUser 
                        }
                    }),
                    Sent: false
                });
            }
        }
        
        if(!outbox || (!outbox[0].MailBody || outbox[0].MailBody === 'undefined')) {
            console.log(`No template found for Net Price Above PVL ${outbox[0].TenderID} with countrycode ${outbox[0].CountryCode}`);
            return;
        }
        return outbox;
    }

    async addMailsToOutbox(mails, syncDate) {
        console.log(`Adding notification mail for Net Price Above PVL sent on: ${syncDate.toDateString()}`);
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
        return Handlebars.compile("" + mail.content)(data);
    }

    async getMailTemplate(templateId) {
        console.log('Get mail templates for Net Price Above PVL');
        console.table(templateId);

        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
        try{
            const result = await fastbackendAPI.send({
                method: 'GET',
                path: `/v2/conditioncontracting/MailTemplate(CountryCode='${this.countryCode}',Language='${this.countryCode}',TemplateId='${templateId}')?$expand=MailTemplateFile&$select=MailTemplateFile.content`
            });

            const data = result?.d;
            data.MailTemplateFile.content = data?.MailTemplateFile?.content ? Buffer.from(data?.MailTemplateFile?.content, 'base64') : null;
            return data;
        }catch(error){
            console.error("No mail template found");
            return;
        }
    }
};