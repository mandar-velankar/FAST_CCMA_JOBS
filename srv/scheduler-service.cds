using {com.bayer.SXTENDER.ccma} from '../db/schema';
using {
    User,
    Country,
    managed,
    cuid
} from '@sap/cds/common';

service SchedulerService @(path : 'schedulerccma')@(requires : ['authenticated-user']) {
    type Job {
        Name  : String;
        JobTime: String;
        Status: String;
    };
    entity SchedulerJobConfigCCMA as projection on ccma.SchedulerJobConfigCCMA;
    function SystemJobs() returns array of Job;
    action ManageJob( Action:String, JobName:String ) returns array of Job;
    // function startTestJob() returns String; // Uncomment to test the job manually
}
