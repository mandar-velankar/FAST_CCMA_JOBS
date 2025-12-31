const cds = require('@sap/cds')
const jobManager = require("./jobs/JobManager");

cds.on('served', async (services) => {
  jobManager.registerJobs();

  // const CCMContractsCreatedNotificationMailJob = require("./jobs/CCMContractsCreatedNotificationMailJob");
  // new CCMContractsCreatedNotificationMailJob("test","*").onTick();
  
  //const AutoExtendContractsJob = require("./jobs/AutoExtendContractsJob");
  // new AutoExtendContractsJob("test","*").onTick();

  // const CCMContractExpiringNotificationMailJob = require("./jobs/CCMContractExpiringNotificationMailJob");
  // new CCMContractExpiringNotificationMailJob("test","*").onTick();

  // const CCMContractNotificationNetPriceAbovePVLJob = require("./jobs/CCMContractNotificationNetPriceAbovePVLJob");
  // new CCMContractNotificationNetPriceAbovePVLJob("test","*").onTick();

  // const CCMContractNotificationNetPriceBelowFloorJob = require("./jobs/CCMContractNotificationNetPriceBelowFloorJob");
  // new CCMContractNotificationNetPriceBelowFloorJob("test","*").onTick();
});