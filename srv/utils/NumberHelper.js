const n2words = require('n2words')

const arr = x => Array.from(x);
const num = x => Number(x) || 0;
const str = x => String(x);
const isEmpty = xs => xs.length === 0;
const take = n => xs => xs.slice(0, n);
const drop = n => xs => xs.slice(n);
const reverse = xs => xs.slice(0).reverse();
const comp = f => g => x => f(g(x));
const not = x => !x;
const chunk = n => xs =>
    isEmpty(xs) ? [] : [take(n)(xs), ...chunk(n)(drop(n)(xs))];

/**
	 * Country Specific formatter for numbers in words
     * don't use this method if the generic method matches the use case 
	 * @param {Number n}
	 * @return {String s}
*/
let inWords = (n) => {

    //if nothing to convert to amount in words
    if(n === null){
        return "";
    }

    // parse to fload in case value has type string to continue (need to round)
    if(typeof n === 'string' || n instanceof String){
        n = parseFloat(n);
    }

    //round to two decimals
    n = Math.round((n + Number.EPSILON) * 100) / 100;

    //convert to string (method needs a string to continue)
    n = String(n);
    
    
    let a = [
        '', 'One', 'Two', 'Three', 'Four',
        'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
        'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];

    let b = [
        '', '', 'Twenty', 'Thirty', 'Forty',
        'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
    ];

    let g = [
        '', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion',
        'Quintillion', 'Sextillion', 'Septillion', 'Octillion', 'Nonillion'
    ];


    let makeGroup = ([ones, tens, huns]) => {
        return [
            num(huns) === 0 ? '' : a[huns] + ' Hundred ',
            num(ones) === 0 ? b[tens] : b[tens] && b[tens] + '-' || '',
            a[tens + ones] || a[ones]
        ].join('');
    };

    let thousand = (group, i) => group === '' ? group : `${group} ${g[i]}`;



    if (typeof n === 'number')
        return inWords(String(n));
    else if (n === '0')
        return 'zero';
    else {      
        // get the dot position
        let amount, cents, numInWords = "";
        let dotPos = n.indexOf('.');

        if (dotPos > 0) {

            amount = n.slice(0, dotPos);  // 1234.56 = 1234
            cents = n.slice(dotPos + 1);  // 1234.56 = .56

        } else if (dotPos == 0) {

            amount = '0';
            cents = n.slice(dotPos + 1);  // 1234.56 = .56

        } else {

            amount = n.slice(0);         // 1234 = 1234
            cents = '0';
        }


        if (amount.length > 0) {
            numInWords = comp(chunk(3))(reverse)(arr(amount))
                .map(makeGroup)
                .map(thousand)
                .filter(comp(not)(isEmpty))
                .reverse()
                .join(' ');
        }
        //EHQUT-INC0162365 | INC15186896 - Total Amount in Words
        if (Number(cents) > 0) {

            if (cents.length === 1)
                cents = cents + '0';
            
            numInWords += ' Point ';
            numInWords += comp(chunk(3))(reverse)(arr(cents))
                .map(makeGroup)
                .map(thousand)
                .filter(comp(not)(isEmpty))
                .reverse()
                .join(' ');
            //numInWords += 'cents ';
        }
        //EHQUT-INC0162365 | INC15186896 - Total Amount in Words
        //currency only addition is now done after method
        //numInWords += currency + ' only';

        return numInWords;
    }

};

module.exports = {
    

    /**
     * Always use this method for transforming amounts into words
     * @param {} countryCode 
     * @param {*} value 
     * @returns 
     */
    formatNumberToText:function(countryCode,value){

        if(countryCode === "IT"){
            //this is a generic method that can be used for all languages 
            //in the future we want to align more between countries and always use this method           
            return this.inWordsGeneric(countryCode,value); 
        }else{
            //this is our original more specific method created for ES in Thailand & MEA (beceause they had special requirements)
            return inWords(value);
        }

        
    },

    /**
     * Use this method for all future countries that don't have specific requirements in there formatting
     * Generic way of the standard library
     * @param {*} countryCode 
     * @param {*} value 
     * @returns 
     */
    inWordsGeneric:function(countryCode,value){

        let language = countryCode.toLowerCase();//TODO:connect country with language in new entity!
        
        // parse to fload in case value has type string to continue
        if(typeof value === 'string' || value instanceof String){
            value = parseFloat(value);
        }
        //round to two decimals
        value = Math.round((value + Number.EPSILON) * 100) / 100;

        //specific logic for italy with decimals
        //only convert digits before comma
        //keep decimals as numbers
        if(language === "it" && value % 1 !== 0){
            return `${n2words(Math.floor(value), {lang: language})}`;
        }
        //set language to "en" for all other countries besides "it"
        if(language !== "it"){
            language = "en";
        }
        //convert number to words
        let words = n2words(value, {lang: language});
        //apply rules for en
        if(language === "en"){
            words = words.replace(/ and /g," ").replace("point","and");
            words += " cents";
        }
        return words;
        
    }
};