const puppeteer = require('puppeteer');
const { intercept, patterns } = require('puppeteer-interceptor');
const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const { URL } = require('url');


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {


  let targetUrl = new URL('http://127.0.0.1:8080/WebGoat/attack');
  let targetScope = targetUrl.host;


  const browser = await puppeteer.launch({
    headless: false, devtools: true,
  });

  // 初始化cluster
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 2,
    browser: browser,
    skipDuplicateUrls: true,
  });

  await cluster.task(async ({ page, data: url }) => {

    let currentScope = '';
    try {
      let _url = new URL(url);
      currentScope = _url.host;
    } catch (error) {
      console.log("cluster error => ", url);
      return;
    }

    // 判断是否为当前任务领空
    if (currentScope !== targetScope) {
      return;
    }

    // 判断是否为注销页面
    let isLogout = url.toLowerCase().includes('logout');
    if (isLogout == true) {
      return;
    }

    const cookiesString = fs.readFileSync('scope-cookie.json', 'utf8');
    const cookies = JSON.parse(cookiesString);
    // await page.setCookie(...cookies);
    await page.setCookie.apply(page, cookies);

    // intercept(page, patterns.All('*'), {
    //   onInterception: event => {
    //     console.log(`${event.request.url} ${event.request.method} intercepted.`)
    //   },
    // });

    await sleep(3000);

    await page.goto(url, {
      waitUntil: [
        'load',
        'domcontentloaded',
        'networkidle0',
        'networkidle2']
    });

    console.log("================> task: ", url);
    const data = await page.evaluate(() => document.querySelector('*').outerHTML);
    console.log(data);

    let a_tags = await page.evaluate(() => {
      let elements = Array.from(document.querySelectorAll('a'));
      let links = elements.map(element => {
        return element.href
      })
      return links;
    });

    // filter out the links that are not in the target scope
    // filter duplicated links
    for (var i = 0; i < a_tags.length; i++) {
      let tag = a_tags[i];
      console.log("cluster url: ", tag);
      if (!tag.trim()) {
        continue;
      }
      cluster.queue(tag);
    }

    // a_tags.forEach(tag => {
    //   console.log("cluster url: ", tag);
    //   cluster.queue(tag);
    // });

  });


  const page = await browser.newPage();
  await page.goto(targetUrl.href, {
    waitUntil: [
      'load',
      'domcontentloaded',
      'networkidle0',
      'networkidle2'],
  });

  // intercept(page, patterns.All('*'), {
  //   onInterception: event => {
  //     console.log(`${event.request.url} intercepted.`)
  //   },
  //   // onResponseReceived: event => {
  //   //   console.log(`${event.request.url} intercepted, going to modify`)
  //   //   event.response.body += `\n;console.log("This script was modified inline");`
  //   //   return event.response;
  //   // }
  // });


  await page.type('input[name=username]', 'admin123', { delay: 20 });
  await page.type('input[name=password]', '123123', { delay: 20 });

  await page.click('button[type=submit]');

  // wait for sec
  await sleep(1000);

  // login success save cookie
  const cookies = await page.cookies()
  console.info("cookies are ", cookies);

  fs.writeFile('scope-cookie.json', JSON.stringify(cookies, null, 2), function (err) {
    if (err) throw err;
    console.log('completed write of cookies');
  });


  let a_tags = await page.evaluate(() => {

    let elements = Array.from(document.querySelectorAll('a'));
    let links = elements.map(element => {
      return element.href
    })
    return links;

    // let tags = document.querySelectorAll('a');
    // return tags;
  });



  // filter out the links that are not in the target scope
  // filter duplicated links
  for (var i = 0; i < a_tags.length; i++) {
    let tag = a_tags[i];
    console.log("cluster url: ", tag);
    if (!tag.trim()) {
      continue;
    }
    cluster.queue(tag);
  }


  await cluster.idle();
  await cluster.close();

  // await browser.close();
})();