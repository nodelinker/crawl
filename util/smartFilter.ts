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

    paramsFilter: function (searchParams: string) {

      let urlParams = this.getUrlParams(searchParams);
      let urlParamsPattern = new Array<string>();

        // 检查数据类型
        var intRe = /^\d+$/;
        var floatRe = /^\d+\.\d+$/;
        var boolRe = /^(true|false)$/;
        var strRe = /^[\w\W]+$/;

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

        let urlSearchPattern = urlParamsPattern.join("&");

        return urlSearchPattern;
    },

    pathFilter: function(urlPath: string){

      // 纯数字
      var intRe = /^\d+$/;
      // 浮点类型
      var floatRe = /^\d+\.\d+$/;
      // 字符串内包含数字
      var includeIntRe = /\d+/;
      // 检测uuid
      var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      // 检测日期
      var dateRe = /^\d{4}-\d{2}-\d{2}$/;
      // 检测时间
      var timeRe = /^\d{2}:\d{2}:\d{2}$/;
      // 检测时间戳
      var timestampRe = /^\d{13}$/;
      // 检测中文
      var chineseRe = /^[\u4E00-\u9FA5\uF900-\uFA2D]+$/;
      // 检测英文
      var englishRe = /^[a-zA-Z]+$/;
      // 检测随机字符串
      var random16Re = /^[a-zA-Z0-9]{16}$/;
      var random32Re = /^[a-zA-Z0-9]{32}$/;
      // 检测unicode
      var unicodeRe = /(?:\\u\w{4})+/;
      // 检测md5
      var md5Re = /^[a-f0-9]{32}$/;
      // 检测sha1
      var sha1Re = /^[a-f0-9]{40}$/;
      // 检测sha256
      var sha256Re = /^[a-f0-9]{64}$/;


      let urlSeq = urlPath.split('/');

      for (var i = 0; i < urlSeq.length; i++){
        // console.log(urlSeq[i]);

        let seq = urlSeq[i];

        if (intRe.test(seq)) {

          if (timestampRe.test(seq)) {
            urlSeq[i] = `{timestamp}`;
          }else{
            urlSeq[i] = `{int}`;
          }
          
        }else if (floatRe.test(seq)) {
          urlSeq[i] = `{float}`;
        }else if (uuidRe.test(seq)) {
          urlSeq[i] = `{uuid}`;
        }else if (dateRe.test(seq)) {
          urlSeq[i] = `{date}`;
        }else if (timeRe.test(seq)) {
          urlSeq[i] = `{time}`;
        }else if (chineseRe.test(seq)){
          urlSeq[i] = `{chinese}`;
        }else if (unicodeRe.test(seq)){
          urlSeq[i] = `{unicode}`;
        }else if (englishRe.test(seq)){
          urlSeq[i] = `{english}`;
          urlSeq[i] = seq;
        }else if (random16Re.test(seq)){
          urlSeq[i] = `{random16}`;
        }else if (random32Re.test(seq)){
          urlSeq[i] = `{random32}`;
        }else if (md5Re.test(seq)){
          urlSeq[i] = `{md5}`;
        }else if (sha1Re.test(seq)){
          urlSeq[i] = `{sha1}`;
        }else if (sha256Re.test(seq)){
          urlSeq[i] = `{sha256}`;
        }else {
          // do nothing
        }

      }

      let urlPathPattern = urlSeq.join('/');
      return urlPathPattern;

    },
      

    smartFilter: function(method:string, url:string){

        let _url = new URL(url);
        let filteredParams = this.paramsFilter(_url.search);
        let filteredPath = this.pathFilter(_url.pathname);

        _url.search = filteredParams;
        _url.pathname = filteredPath;
        
      
        
    },



    bloomFilter: new BloomFilter(1073741824, 10),
};