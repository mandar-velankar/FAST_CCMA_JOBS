const JobFactory = require('./JobFactory');
const CronJobManager = require('cron-job-manager');
const cds = require('@sap/cds');
const jobScheduler = require("./scheduler");

class JobManager {

    constructor() {
        this.cronManager = new CronJobManager();
    }
    getCronManager() {
        return this.cronManager;
    }
    jobExists(jobConfig){
        return this.cronManager.exists(jobConfig.JobName);
    }
    isJobSupported(jobConfig) {
        try {
            //if factory is not able to create an instance for this jobname, it is not supported
            JobFactory.create(jobConfig.JobName, jobConfig.JobTime);

            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    registerJob(jobConfig) {
        //register job if not yet exists and contains a time
        this.cronManager.exists(jobConfig.JobName) && console.log(`${jobConfig.JobName} already exists`);
        !jobConfig.JobTime && console.log(`Job time is empty: ${jobConfig.JobTime}`);

        if (jobConfig.JobTime && !this.cronManager.exists(jobConfig.JobName)) {
            console.log(`Adding Job : ${jobConfig.JobName} to manager`);
            
            this.addJob(jobConfig);//register job using JobFactory
        }
    }
    addJob(jobConfig) {
        //register job using JobFactory
        const job = JobFactory.create(jobConfig.JobName, jobConfig.JobTime);
        this.cronManager.add(job.getJobName(), job.getJobTime(), job.onTick.bind(job));
        this.cronManager.start(job.getJobName());
    }
    unregisterJob(jobConfig){
        this.cronManager.exists(jobConfig.JobName) && this.cronManager.deleteJob(jobConfig.JobName);
    }

    stopJob(JobName) {
        //stop job if exists, if no name is provided, stop all
        if(JobName){
            this.cronManager.exists(JobName) && this.cronManager.stop(JobName);
        }else{
            this.cronManager.stopAll();
        }
    }
    startJob(JobName) {
        //start job if exists, if no name is provided, start all
        if(JobName){
            this.cronManager.exists(JobName) && this.cronManager.start(JobName);
        }else{
            this.cronManager.startAll();
        }
    }
    updateJob(jobConfig) {
        //update job if exists, otherwise register as new job
        if (this.cronManager.exists(jobConfig.JobName)) {
            this.cronManager.update(jobConfig.JobName, jobConfig.JobTime);
        } else {
            this.registerJob(jobConfig);
        }
    }
    async registerJobs() {
        //register all jobs from config table in database - used during startup of the app
        const db = await cds.connect.to('db'); // connect to database service
        const { SchedulerJobConfig } = db.entities("com.bayer.SXTENDER.ccma");

        const jobsConfig = await cds.run(SELECT.from(SchedulerJobConfig));

        jobsConfig.forEach((jobConfig)=>this.registerJob(jobConfig));
    }
    getJobs() {
        //list all jobs in the manager
        let jobs = [];
        for (let job in this.cronManager.jobs) {
            jobs.push({
                Name: job,
                JobTime: this.cronManager.jobs[job].cronTime.source,
                Status: this.cronManager.jobs[job].running ? 'Running' : 'Not running'
            });
            //console.log(`${job} -  ${cronManager.jobs[job].cronTime.source} - ${(cronManager.jobs[job].running ? 'Running' : 'Not running')}`);
        }
        return jobs;
    }
}
if (!this.jobManager) this.jobManager = new JobManager();

module.exports = this.jobManager;