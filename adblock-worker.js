const {parentPort,workerData}=require('node:worker_threads');
const {FiltersEngine}=require('@ghostery/adblocker');
parentPort.postMessage(FiltersEngine.parse(workerData,{loadCosmeticFilters:true}).serialize());
