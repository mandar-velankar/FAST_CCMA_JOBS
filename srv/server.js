const cds = require('@sap/cds')
const jobManager = require("./jobs/JobManager");

cds.on('served', async (services) => {
  try {
    console.log('[JobManager] Service served; registering configured jobs');
    await jobManager.registerJobs();
    console.log('[JobManager] Configured jobs registered successfully');
  } catch (error) {
    console.error('[JobManager] Failed to register configured jobs:', error);
  }

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