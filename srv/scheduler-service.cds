using {com.bayer.SXTENDER.ccma} from '../db/schema';
using {
    User,
    Country,
    managed,
    cuid
} from '@sap/cds/common';

service SchedulerService @(path : 'scheduler')@(requires : ['authenticated-user']) {
    type Job {
        Name  : String;
        JobTime: String;
        Status: String;
    };
    entity SchedulerJobConfig as projection on ccma.SchedulerJobConfig;
    function SystemJobs() returns array of Job;
    action ManageJob( Action:String, JobName:String ) returns array of Job;
}
