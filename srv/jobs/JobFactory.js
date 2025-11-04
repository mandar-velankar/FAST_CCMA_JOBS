
const CCMContractsCreatedNotificationMailJob = require("./CCMContractsCreatedNotificationMailJob");

module.exports = class JobFactory {
    static create(jobName, jobTime) {
        switch (jobName) {
            case this.jobNames.CCMContractsCreatedNotificationMailJob:
                return new CCMContractsCreatedNotificationMailJob(jobName,jobTime)
                break;
            default:
                throw new Error('Job type not supported');
                break;
        }
    }
    static get jobNames() {
        return {
            CCMContractsCreatedNotificationMailJob: "CCMContractsCreatedNotificationMailJob"
        };
    }
}