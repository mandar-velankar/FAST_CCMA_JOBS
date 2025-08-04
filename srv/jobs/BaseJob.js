const cds = require('@sap/cds');

class BaseJob {
    constructor(jobName,jobTime) {
        if (!jobName) {
            throw new Error('ERR_INVALID_ARG_VALUE');
        }

        this.jobName = jobName;
        this.jobTime = jobTime;
    }
    async onTick() {
        throw new Error('No implementation for this Job');
    }
    getJobName(){
        return this.jobName;
    }
    getJobTime(){
        return this.jobTime;
    }
}

module.exports = BaseJob;