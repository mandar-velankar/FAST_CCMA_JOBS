const cds = require('@sap/cds')
const jobManager = require("./jobs/JobManager");

cds.on('served', async (services) => {
    jobManager.registerJobs();
    // const ProcessMasterDataPrices = require("./jobs/brasil/ProcessMasterDataPrices");
  // new ProcessMasterDataPrices("test","*").onTick();
  // const scheduler = await jobScheduler();
  // scheduler.mercadoPublico.fetchTenders();//('00 00 * * *').start();
  // scheduler.mercadoPublico.fetchTenderResults('00 00 * * *').start();
  // scheduler.mercadoPublico.fetchPurchaseOrders('00 00 * * *').start();

  // jobScheduler.ItalyJobs.processMaterials('57 10 * * *').start();
  // jobScheduler.ItalyJobs.processCustomers('57 10 * * *').start();

  // const ProcessOpportunities = require("./jobs/brasil/ProcessOpportunities");
  // new ProcessOpportunities("test","*").onTick();

  // const ProcessEmpenho = require("./jobs/brasil/ProcessEmpenho");
  // new ProcessEmpenho("test","*").onTick();

  // const ProcessTenderResults = require("./jobs/brasil/ProcessTenderResults");
  // new ProcessTenderResults("test","*").onTick();
});