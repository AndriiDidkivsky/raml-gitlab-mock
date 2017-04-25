
const mockService = require('osprey-mock-service');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const express = require('express');
const parser = require('raml-1-parser');
const osprey = require('osprey');
const http = require('http');
const config = require('./raml.config');
const app = express();
const tar = require('tar');
const rimraf = require('rimraf');
const PORT = 4201;

function chainAndLog (msg, type) {
  return function (data) {
    if(type && typeof console[type] === 'function'){
      console[type](msg)
    }
    else {
      console.log(msg)
    }
    return data;
  }
}

function GET(cfg) {
  return new Promise((resolve, reject) => {
    http.get(cfg, (res) => {
      let body = [];
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error('statusCode=' + res.statusCode));
      }

      res.on('data', function (chunk) {
        body.push(chunk);
      });

      res.on('end', function () {
        try {
          // body = JSON.parse(body);
        } catch (e) {
          reject(e);
        }
        resolve(Buffer.concat(body));
      });
    });
  });
}

function parseRamls(sourses) {
  let all = [];
  console.log('parse')
  sourses.forEach((src) => {
    all.push(parser.loadRAML(path.join(__dirname, 'temp', src), {rejectOnErrors: false}))
  });
  return Promise.all(all);
}

function serializeRamls(ramlApis) {
  return ramlApis.map(ramlApi => {
    return ramlApi.expand(true).toJSON({serializeMetadata: false});
  })
}

function configureAndListen(ramls) {
  ramls.forEach(raml => {
    app.use(osprey.server(raml));
    app.use(mockService(raml));
  });
  rimraf('temp', ()=>{
    app.listen(PORT)
  })

}

function unzip (data) {
  return new Promise(function(resolve, reject){
    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(data));
    bufferStream
    .pipe(tar.Extract({path:'temp', strip: 1}))
    .on('end', resolve);    
  })
} 

function run(config) {
  let all = [];
  console.log('Getting repo');
  rimraf('temp', ()=>{
    GET(config.options)
      .then(chainAndLog('Unzipping'))
      .then(unzip)
      .then(chainAndLog('Parsing ramls'))
      .then(()=>parseRamls(config.sources))
      .then(chainAndLog('Serializing ramls'))
      .then(serializeRamls)
      .then(configureAndListen)
      .then(chainAndLog('========SUCCESSFULLY================='))
      .then(chainAndLog(`Listening port ${PORT}`))  
  })
  
}

run(config.fromApi.gitLab);

