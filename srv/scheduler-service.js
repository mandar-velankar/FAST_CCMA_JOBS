const cds = require('@sap/cds');
const JobManager = require("./jobs/JobManager");
const AutoExtendContractsJob = require("./jobs/AutoExtendContractsJob");
const CCMContractsCreatedNotificationMailJob = require("./jobs/CCMContractsCreatedNotificationMailJob");
const CCMContractExpiringNotificationMailJob = require("./jobs/CCMContractExpiringNotificationMailJob");
const CCMContractIdentifyPriceUpdateJob = require("./jobs/CCMContractIdentifyPriceUpdateJob");
const CCMContractsCancelledNotificationMailJob = require("./jobs/CCMContractsCancelledNotificationMailJob");
module.exports = (srv) => {


    srv.after('UPDATE', 'SchedulerJobConfigCCMA', async (SchedulerJobConfig, req) => {
        console.log(`[SchedulerService] Updating job: ${SchedulerJobConfig.JobName}, schedule: ${SchedulerJobConfig.JobTime}`);
        JobManager.updateJob(SchedulerJobConfig);
    });
    srv.before('INSERT', 'SchedulerJobConfigCCMA', async (req) => {
        console.log(`[SchedulerService] Validating new job: ${req.data.JobName}, schedule: ${req.data.JobTime}`);
        //check if already job exists
        if(JobManager.jobExists(req.data)){
            req.reject(404, 'Job already exists');
        }
        if (!JobManager.isJobSupported(req.data)){
            req.reject(404, 'Job is not supported');
        }
    });
    srv.after('INSERT', 'SchedulerJobConfigCCMA', (SchedulerJobConfig, req) => {
        console.log(`[SchedulerService] Job configuration inserted: ${SchedulerJobConfig.JobName}`);
        JobManager.registerJob(SchedulerJobConfig);
    });
    srv.after('DELETE','SchedulerJobConfigCCMA',(SchedulerJobConfig)=>{
        console.log(`[SchedulerService] Job configuration deleted: ${SchedulerJobConfig.JobName}`);
        JobManager.unregisterJob(SchedulerJobConfig);
    });
    srv.on('SystemJobs', async (req) => {
        console.log('[SchedulerService] Reading current system jobs');
        return JobManager.getJobs();
    });
    srv.on('ManageJob',async (req)=>{
        const action = req.data.Action.toString().toUpperCase();
        console.log(`[SchedulerService] ${action} requested for job: ${req.data.JobName || 'all jobs'}`);
        if(action === "START") JobManager.startJob(req.data.JobName);
        else if(action === "STOP") JobManager.stopJob(req.data.JobName);
        else throw new Error("Wrong action");
        return JobManager.getJobs();
    });
    /**Uncomment to test the job manually **/

    // srv.on('startTestJob', async (req) => {
    //     JobManager.registerJobs();
    //     new AutoExtendContractsJob("test","*").onTick();
    //     new CCMContractsCreatedNotificationMailJob("test","*").onTick();
    //     new CCMContractIdentifyPriceUpdateJob("test","*").onTick();
    //     return "Test Job Started";
    // });
};