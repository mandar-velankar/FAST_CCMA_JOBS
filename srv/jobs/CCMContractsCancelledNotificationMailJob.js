const cds = require('@sap/cds');
const BaseJob = require('./BaseJob');
const Handlebars = require("handlebars");
const cfenv = require("cfenv");
const { tryCatch } = require('ramda');

module.exports = class CCMContractsCancelledNotificationMailJob extends BaseJob {

    constructor(jobName, jobTime) {
        super(jobName, jobTime);
        this.terminationDate = null;
    }

    /**
     * Triggered when job has started
     */
    //override
    async onTick() {

        const syncDate = new Date();
        this.terminationDate = new Date(syncDate);
        this.terminationDate.setDate(this.terminationDate.getDate() - 1);
        this.terminationDate = this.terminationDate.toJSON().substring(0, 10);
        console.log(`Processing notification mail for Cancelled CCM Contracts ${syncDate.toDateString()} STARTED ... `);

        try {           

            // get mail Template
            const templateId = 'CCMContractsCancelledNotificationMail';
            const mailTemplate = await this.getMailTemplate(templateId);

            //get customer prices
            const cancelledData = await this.getCancelledCCMContractsData(syncDate);

            // console.dir(pas,{ depth: null });
            if (cancelledData && cancelledData.length > 0) {
                let mail = this.mapDataToMail(mailTemplate, syncDate, cancelledData);
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

        console.log(`Processing notification mail for Cancelled CCM Contracts ${syncDate.toDateString()} FINISHED`);
    }

    /**
     * Fetch Customer Prices which are synchronized but not yet notified.
     * Price Agreement and Tender data is aggregated.
     * @param {Date} date 
     * @returns {Array<Objects>}  A list of aggregated data
     */
    async getCancelledCCMContractsData(date) {
        this.db = await cds.connect.to('db'); 
        console.log(`Fetching Cancelled Contracts ${date.toDateString()}`);
        const { CCMContractsCancelledNotificationMailJob} = this.db.entities('ConditionContract');
        const tx = this.db.tx();

        const startOfToday = new Date(date);
        startOfToday.setHours(0, 0, 0, 0);

        const startOfTomorrow = new Date(startOfToday);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

        const cancelledContracts = await tx.run(
            SELECT.from(CCMContractsCancelledNotificationMailJob)
                .where([
                    { ref: ['modifiedAt'] },
                    '>=',
                    { val: startOfToday },
                    'and',
                    { ref: ['modifiedAt'] },
                    '<',
                    { val: startOfTomorrow }
                ])
        );
        return cancelledContracts;
    }

    mapDataToMail(template, syncDate, data) {
        if (!template) {
        console.warn('mapDataToMail called without a valid template');
        return [];
        }

        if (!Array.isArray(data) || data.length === 0) {
        return [];
        }

        // build fast UI host from environ
        const appEnv = cfenv.getAppEnv();
        const fastUIAppHost = (appEnv && appEnv.url) ? appEnv.url.replace('f-tndr-cag-fast-ccma-jobs-srv', 'fastui-app') : '';

        // normalize the rows (do not mutate original objects if possible)
        data.forEach(d => {
            d.EffectiveDate = new Date(d.EffectiveDate).toJSON().substring(0,10),
            d.ExpiryDate = new Date(d.ExpiryDate).toJSON().substring(0,10),
            d.URL = `${fastUIAppHost}/app/index.html#/conditioncontract&/ccma/detail/${d.CCMContractID}`
        })

        const base64Content = template?.d?.MailTemplateFile?.content;
        const templateContent = base64Content ? Buffer.from(base64Content, 'base64') : null;

        const outbox = [];

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
            console.log(`No template found for Customer Price of tender ${outbox[0].TenderID} with countrycode ${outbox[0].CountryCode}`);
            return;
        }

        return outbox;
    }

    async addMailsToOutbox(mail, syncDate) {
        console.log(`Adding notification mail for CCM Contracts synchronised with SAP on: ${syncDate.toDateString()}`);
        const fastbackendAPI = await cds.connect.to("FASTBACKEND_API");
        return this.sendMailBatch(
            fastbackendAPI,
            Array.isArray(mail) ? mail : [mail]
        );
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
            const status = error?.reason?.response?.status ?? error?.response?.status;

            if (status !== 413) {
                throw error;
            }

            if (batch.length > 1) {
                const middle = Math.ceil(batch.length / 2);
                const [leftResult, rightResult] = await Promise.all([
                    this.sendMailBatch(fastbackendAPI, batch.slice(0, middle)),
                    this.sendMailBatch(fastbackendAPI, batch.slice(middle))
                ]);

                return [...leftResult, ...rightResult];
            }

            return [await this.sendOversizedMail(batch[0])];
        }
    }

    async sendOversizedMail(mail) {
        const fastbackendODataAPI = await cds.connect.to("FASTBACKEND_ODATA_API");
        const { MailBody, ...metadata } = mail;
        const bodyBytes = Buffer.from(MailBody, 'utf8');

        console.warn(
            `Uploading oversized mail body: bytes=${bodyBytes.length}, TenderID=${mail.TenderID}, OfferID=${mail.OfferID}`
        );

        const uploadResult = await fastbackendODataAPI.send({
            method: 'POST',
            path: '/sta_tender/OutgoingMailBodyUploads',
            data: {
                ...metadata,
                Status: 'UPLOADING',
                MediaType: 'text/html; charset=utf-8'
            }
        });

        const uploadId = this.extractId(uploadResult);
        if (!uploadId) {
            throw new Error('Outgoing mail body upload did not return an ID');
        }

        await fastbackendODataAPI.send({
            method: 'PUT',
            path: `/sta_tender/OutgoingMailBodyUploads/${uploadId}/Content`,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Length': String(bodyBytes.length)
            },
            data: bodyBytes
        });

        return fastbackendODataAPI.send({
            method: 'POST',
            path: '/sta_tender/completeMailBodyUpload',
            data: { uploadId }
        });
    }

    extractId(result) {
        return result?.ID ?? result?.d?.ID ?? result?.d?.results?.[0]?.ID ?? result?.value?.ID;
    }

    generateMailBody(content, data) {
        return Handlebars.compile("" + content)(data);
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
};
