
const CCMContractsCreatedNotificationMailJob = require("./CCMContractsCreatedNotificationMailJob");
const AutoExtendContractsJob = require("./AutoExtendContractsJob");
const CCMContractExpiringNotificationMailJob = require("./CCMContractExpiringNotificationMailJob");

module.exports = class JobFactory {
    static create(jobName, jobTime) {
        switch (jobName) {
            case this.jobNames.CCMContractsCreatedNotificationMailJob:
                return new CCMContractsCreatedNotificationMailJob(jobName,jobTime)
                break;
            case this.jobNames.AutoExtendContractsJob:
                return new AutoExtendContractsJob(jobName,jobTime)
                break;
            case this.jobNames.CCMContractExpiringNotificationMailJob:
                return new CCMContractExpiringNotificationMailJob(jobName,jobTime)
                break;
            default:
                throw new Error('Job type not supported');
                break;
        }
    }
    static get jobNames() {
        return {
            CCMContractsCreatedNotificationMailJob: "CCMContractsCreatedNotificationMailJob",
            AutoExtendContractsJob: "AutoExtendContractsJob",
            CCMContractExpiringNotificationMailJob: "CCMContractExpiringNotificationMailJob"
        };
    }
}