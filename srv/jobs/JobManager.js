const JobFactory = require('./JobFactory');
const CronJobManager = require('cron-job-manager');
const cds = require('@sap/cds');

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
        if (this.cronManager.exists(jobConfig.JobName)) {
            console.log(`[JobManager] Job already exists: ${jobConfig.JobName}`);
        }
        if (!jobConfig.JobTime) {
            console.log(`[JobManager] Job time is empty, skipping: ${jobConfig.JobName}`);
        }

        if (jobConfig.JobTime && !this.cronManager.exists(jobConfig.JobName)) {
            console.log(`[JobManager] Adding job: ${jobConfig.JobName}, schedule: ${jobConfig.JobTime}`);
            
            this.addJob(jobConfig);//register job using JobFactory
        }
    }
    addJob(jobConfig) {
        //register job using JobFactory
        const job = JobFactory.create(jobConfig.JobName, jobConfig.JobTime);
        console.log(`[JobManager] Created job: ${jobConfig.JobName}`);
        this.cronManager.add(job.getJobName(), job.getJobTime(), job.onTick.bind(job));
        this.cronManager.start(job.getJobName());
        console.log(`[JobManager] Started job: ${job.getJobName()}, schedule: ${job.getJobTime()}`);
    }
    unregisterJob(jobConfig){
        if (this.cronManager.exists(jobConfig.JobName)) {
            this.cronManager.deleteJob(jobConfig.JobName);
            console.log(`[JobManager] Unregistered job: ${jobConfig.JobName}`);
        } else {
            console.log(`[JobManager] Cannot unregister job; not found: ${jobConfig.JobName}`);
        }
    }

    stopJob(JobName) {
        //stop job if exists, if no name is provided, stop all
        if(JobName){
            if (this.cronManager.exists(JobName)) {
                this.cronManager.stop(JobName);
                console.log(`[JobManager] Stopped job: ${JobName}`);
            } else {
                console.log(`[JobManager] Cannot stop job; not found: ${JobName}`);
            }
        }else{
            this.cronManager.stopAll();
            console.log('[JobManager] Stopped all jobs');
        }
    }
    startJob(JobName) {
        //start job if exists, if no name is provided, start all
        if(JobName){
            if (this.cronManager.exists(JobName)) {
                this.cronManager.start(JobName);
                console.log(`[JobManager] Started job manually: ${JobName}`);
            } else {
                console.log(`[JobManager] Cannot start job; not found: ${JobName}`);
            }
        }else{
            this.cronManager.startAll();
            console.log('[JobManager] Started all jobs');
        }
    }
    updateJob(jobConfig) {
        //update job if exists, otherwise register as new job
        if (this.cronManager.exists(jobConfig.JobName)) {
            this.cronManager.update(jobConfig.JobName, jobConfig.JobTime);
            console.log(`[JobManager] Updated job: ${jobConfig.JobName}, schedule: ${jobConfig.JobTime}`);
        } else {
            this.registerJob(jobConfig);
        }
    }
    async registerJobs() {
        //register all jobs from config table in database - used during startup of the app
        console.log('[JobManager] Loading jobs from SchedulerJobConfigCCMA');
        const db = await cds.connect.to('db'); // connect to database service
        const { SchedulerJobConfigCCMA } = db.entities("com.bayer.SXTENDER.ccma");

        const jobsConfig = await cds.run(SELECT.from(SchedulerJobConfigCCMA));
        console.log(`[JobManager] Found ${jobsConfig.length} job configuration(s)`);

        jobsConfig.forEach((jobConfig) => {
            try {
                this.registerJob(jobConfig);
            } catch (error) {
                console.error(`[JobManager] Failed to register job: ${jobConfig.JobName}`, error);
            }
        });
        console.log('[JobManager] Finished registering jobs');
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