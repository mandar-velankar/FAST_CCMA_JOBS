const cds = require('@sap/cds');
// const BaseCron = require('cron-es6');
const BaseJob = require('./BaseJob');
const axios = require('axios');
const qs = require("qs");
const cfenv = require("cfenv");
const Handlebars = require("handlebars");

module.exports = class CCMContractIdentifyPriceUpdateJob extends BaseJob {

     constructor(jobName, jobTime) {
        super(jobName, jobTime);
    }

     /**
     * Triggered when job has started
     */
    //override
    async onTick() {

        console.log('CCM Contract Identify Price Update Job Started ...');

        try {
            this.db = await cds.connect.to('db'); 
            const tx = this.db.tx();
            const ConditionContract = await cds.connect.to('ConditionContract');
            // Fetch active contracts
            const { CCMContractsCreatedNotificationMailJobView } = this.db.entities("ConditionContract");
            
            let activeContracts = await tx.run(SELECT.from(CCMContractsCreatedNotificationMailJobView).where({ContractType: 'Invoice'}));

            if(activeContracts && activeContracts.length > 0){
                for (const activeContract of activeContracts){
                    const simulationResult = await ConditionContract.send({
                        method: 'POST', 
                        path: `odata/v4/condition-contract/getSAPSalesOrderSimulation`,
                        data: { "CCMContractID": activeContract.CCMContractID}
                    });

                    console.log(simulationResult + ' for CCMContractID: ' + activeContract.CCMContractID + ' and FASTContractID: ' + activeContract.FastConditionContractID);
                }
            }
 
        } catch (error) {
            console.log(error);
        }

        console.log('CCM Contract Identify Price Update Job finished.');
    }
 
};
