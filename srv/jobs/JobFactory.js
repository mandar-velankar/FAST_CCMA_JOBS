
//const PriceAgreementExpiredMailJob = require("./PriceAgreementExpiredMailJob");

module.exports = class JobFactory {
    static create(jobName, jobTime) {
        switch (jobName) {
            default:
                throw new Error('Job type not supported');
                break;
        }
    }
    static get jobNames() {
        return {

        };
    }
}