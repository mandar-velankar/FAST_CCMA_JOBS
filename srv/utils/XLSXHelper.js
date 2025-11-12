const XlsxTemplate = require('xlsx-template');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

exports.generateXLSX = (templatename, values)=>{
// exports.generateXLSX = (templateBinary, values)=>{

    // Load an XLSX file into memory
    // const filedata = fs.readFileSync(path.join(__dirname, '../xlsx-templates', templatename));
    const filedata = fs.readFileSync(path.join(__dirname, '../xlsx-templates', templatename));
    return this.generateXLSXByFile(filedata,values,2);
};

exports.generateXLSXByFile = (templateBinary, values,sheets)=>{
    // Create a template
    var template = new XlsxTemplate(templateBinary);

    // Replacements take place on second sheet
    var sheetNumber = sheets;

    // Perform substitution
    template.substitute(sheetNumber, values);

    // Refresh first sheet so that references to replaced tags on sheet2 are refreshed
    var sheetNumber = 1;
    template.substitute(sheetNumber, values);

    // Get binary data
    let excel =  template.generate({type:'uint8array'});
    const readableInstanceStream = new Readable({
        read() {
            this.push(excel);
            this.push(null);
        }
    });
    return {
        value: readableInstanceStream
    };
};