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

            // get mail Template
            const templateId = 'CCMContractsCreatedNotificationMail';
            const mailTemplate = await this.getMailTemplate(templateId);

            //get customer prices
            const synchronizedAggregatedData = await this.getSynchronizedCCMContractsData(syncDate);

            // console.dir(pas,{ depth: null });
            if (synchronizedAggregatedData && synchronizedAggregatedData.length > 0) {
                let mail = this.mapDataToMail(mailTemplate, syncDate, synchronizedAggregatedData);
                // console.log(mails);
                if(mail){
                    await this.addMailsToOutbox(mail, syncDate);
                    await this.updateNotificationStatus(synchronizedAggregatedData);
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
        this.db = await cds.connect.to('db'); 
        console.log(`Fetching Contracts synchronized on ${date.toDateString()}`);
        const { CCMContractsCreatedNotificationMailJobView} = this.db.entities('ConditionContract');
        const tx = this.db.tx();
        const dateOnly = date.toJSON().substring(0,10);
        let conditionContracts = await tx.run(
            SELECT.from(CCMContractsCreatedNotificationMailJobView)
                .where({
                    ContractCreationDate: { '>=': dateOnly },
                    NotifiedtoContractOwner: true
                })
        );
        return conditionContracts;
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

        // unique creators / users by CWID (use CWID consistently)
        const uniqueUsers = [...new Set(data.map(item => item.CWID))];
        const base64Content = template?.d?.MailTemplateFile?.content;
        const templateContent = base64Content ? Buffer.from(base64Content, 'base64') : null;

        const outbox = [];

        for (let user of uniqueUsers) {
            let dataFilteredByUser = data.filter(d => d.CWID == user);
            if(dataFilteredByUser && dataFilteredByUser.length > 0){
                outbox.push({
                    CountryCode: dataFilteredByUser[0].CountryCode,
                    TenderID: dataFilteredByUser[0].TenderID,
                    OfferID: dataFilteredByUser[0].OfferID,
                    Sender: 'FAST-Admin@bayer.com',
                    Recipients: dataFilteredByUser[0].UserEmail,
                    Subject: template?.d?.MailTemplateFile?.title,
                    MailBody: this.generateMailBody(templateContent, { 
                        data: { 
                            SyncDate: syncDate.toDateString(), 
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
            console.log(`No template found for Customer Price of tender ${outbox[0].TenderID} with countrycode ${outbox[0].CountryCode}`);
            return;
        }

        return outbox;
    }

    async addMailsToOutbox(mails, syncDate) {
        if (!Array.isArray(mails) || mails.length === 0) {
            return [];
        }

        console.log(
            `Adding ${mails.length} notification mails for CCM Contracts synchronised with SAP on: ${syncDate.toDateString()}`
        );

        const fastbackendAPI = await cds.connect.to('FASTBACKEND_API');

        // Initial conservative batches.
        // Prevent 100 mails from ever becoming one request.
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

    generateMailBody(content, data) {
        return Handlebars.compile("" + content)(data);
    }


    async updateNotificationStatus(contracts) {

        if (!contracts || contracts.length === 0) {
            return;
        }

        const db = await cds.connect.to('db');
        const { CCMContract } = db.entities('ConditionContract');

        for (const contract of contracts) {
            try {
                await db.run(
                    UPDATE(CCMContract)
                        .set({
                            NotifiedtoContractOwner: false
                        })
                        .where({
                            ID: contract.CCMContractID
                        })
                );
            } catch (error) {
                console.error(
                    `Failed to update notification status for contract ${contract.CCMContractID}`,
                    error
                );
            }
        }

        console.log(
            `${contracts.length} contract(s) marked as not notified`
        );
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

    async sendMailBatch(fastbackendAPI, batch) {
        try {
            console.log(
                `Sending mail batch: count=${batch.length}, size=${Buffer.byteLength(JSON.stringify(batch), 'utf8')} bytes`
            );

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
                // We cannot split any further.
                if (batch.length === 1) {
                    const mail = batch[0];

                    console.error(
                        `Single mail is too large to send. TenderID=${mail.TenderID}, OfferID=${mail.OfferID}, size=${Buffer.byteLength(JSON.stringify(mail), 'utf8')} bytes`
                    );

                    throw error;
                }

                const middle = Math.ceil(batch.length / 2);

                const left = batch.slice(0, middle);
                const right = batch.slice(middle);

                console.warn(
                    `Batch of ${batch.length} mails is too large. Splitting into ${left.length} + ${right.length}.`
                );

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
