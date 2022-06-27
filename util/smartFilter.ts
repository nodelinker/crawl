import { BloomFilter } from "bloom-filters";
import { isEmptyBuffer } from "bloom-filters/dist/utils";

// function isEmpty(value: any) {
//     return (
//       (typeof value == "string" && !value.trim()) ||
//       typeof value == "undefined" ||
//       value === null
//     );
//   };

module.exports = {


    isEmpty: function(value: string) {
        return (
          (typeof value == "string" && !value.trim()) ||
          typeof value == "undefined" ||
          value === null
        );
      },

    getUrlParams: function (search:string ) {
        if (this.isEmpty(search)) {
          return {};
        }
        let hashes = search.slice(search.indexOf("?") + 1).split("&");
        return hashes.reduce((params, hash) => {
          let [key, val] = hash.split("=");
          return Object.assign(params, { [key]: decodeURIComponent(val) });
        }, {});
      },
      

    smartFilter: function(method:string, url:string){

        let _url = new URL(url);
        let urlParams = this.getUrlParams(_url.search);
        let urlParamsPattern = new Array<string>();
      
        // 检查数据类型
        var intRe = /^\d+$/;
        var floatRe = /^\d+\.\d+$/;
        var boolRe = /^(true|false)$/;
        var strRe = /^[\w\W]+$/;

        var chineseRe = /[\u4E00-\u9FA5\uF900-\uFA2D]+/;
        var urlencodeRe = /(?:%[A-Fa-f0-9]{2,6})+/;
        var unicodeRe = /(?:\\u\w{4})+/;
        var numSymbolRe = /\.|_|-/;
        var timesatmpRe = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
        var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        var dateRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;


      
        for (const [key, value] of Object.entries<string>(urlParams)) {
          if (intRe.test(value)) {
            urlParamsPattern.push(`${key}={int}`);
          } else if (floatRe.test(value)) {
            urlParamsPattern.push(`${key}={float}`);
          } else if (boolRe.test(value)) {
            urlParamsPattern.push(`${key}={bool}`);
          } else if (strRe.test(value)) {
            urlParamsPattern.push(`${key}={str}`);
          } else {
            urlParamsPattern.push(`${key}={unkonwn}`);
          }
        }
      
        
    },



    bloomFilter: new BloomFilter(1073741824, 10),
};