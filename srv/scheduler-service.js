const cds = require('@sap/cds');
const JobManager = require("./jobs/JobManager");

module.exports = (srv) => {


    srv.after('UPDATE', 'SchedulerJobConfig', async (SchedulerJobConfig, req) => {
        JobManager.updateJob(SchedulerJobConfig);
    });
    srv.before('INSERT', 'SchedulerJobConfig', async (req) => {
        //check if already job exists
        if(JobManager.jobExists(req.data)){
            req.reject(404, 'Job already exists');
        }
        if (!JobManager.isJobSupported(req.data)){
            req.reject(404, 'Job is not supported');
        }
    });
    srv.after('INSERT', 'SchedulerJobConfig', (SchedulerJobConfig, req) => {
        JobManager.registerJob(SchedulerJobConfig);
    });
    srv.after('DELETE','SchedulerJobConfig',(SchedulerJobConfig)=>{
        JobManager.unregisterJob(SchedulerJobConfig);
    });
    srv.on('SystemJobs', async (req) => {
        return JobManager.getJobs();
    });
    srv.on('ManageJob',async (req)=>{
        const action = req.data.Action.toString().toUpperCase();
        if(action === "START") JobManager.startJob(req.data.JobName);
        else if(action === "STOP") JobManager.stopJob(req.data.JobName);
        else throw new Error("Wrong action");
        return JobManager.getJobs();
    });
};