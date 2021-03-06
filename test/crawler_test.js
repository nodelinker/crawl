const puppeteer = require('puppeteer');
const { intercept, patterns } = require('puppeteer-interceptor');
const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const { URL } = require('url');
const winston = require('winston');


const logLevels = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
};


const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}` + (info.splat !== undefined ? `${info.splat}` : " "))
    ),
    // format: winston.format.simple(),
    // defaultMeta: { service: 'user-service' },
    transports: [
        //
        // - Write all logs with importance level of `error` or less to `error.log`
        // - Write all logs with importance level of `info` or less to `combined.log`
        //
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isEmpty(value) {
    return typeof value == 'string' && !value.trim() || typeof value == 'undefined' || value === null;
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

        if (fs.existsSync('scope-cookie.json')) {
            const cookiesString = fs.readFileSync('scope-cookie.json', 'utf8');
            const cookies = JSON.parse(cookiesString);
            // await page.setCookie(...cookies);
            await page.setCookie.apply(page, cookies);
        }

        await sleep(500);

        intercept(page, patterns.XHR('*'), {
            onInterception: event => {
                console.log(`${event.request.url} ${event.request.method} intercepted.`);
            },
        });


        await page.goto(url, {
            waitUntil: [
                'load',
                'domcontentloaded',
                'networkidle0',
                'networkidle2']
        });

        console.log("================> task: ", url);

        await sleep(1000);


        // init javascript env
        await page.evaluate(() => {
            window.sleep = function (time) {
                return new Promise((resolve) => setTimeout(resolve, time));
            }

            // hook setInterval 时间设置为60秒 目的是减轻chrome的压力
            window.__originalSetInterval = window.setInterval;
            window.setInterval = function () {
                arguments[1] = 60000;
                return window.__originalSetInterval.apply(this, arguments);
            };
            Object.defineProperty(window, "setInterval", { "writable": false, "configurable": false });

        });

        // dom0 trigger
        await page.evaluate(() => {
            (async function trigger_all_inline_event() {
                let eventNames = ["onabort", "onblur", "onchange",
                    "onclick", "ondblclick", "onerror",
                    "onfocus", "onkeydown", "onkeypress",
                    "onkeyup", "onload", "onmousedown",
                    "onmousemove", "onmouseout", "onmouseover",
                    "onmouseup", "onreset", "onresize",
                    "onselect", "onsubmit", "onunload"];
                for (let eventName of eventNames) {
                    let event = eventName.replace("on", "");
                    let nodeList = document.querySelectorAll("[" + eventName + "]");
                    if (nodeList.length > 100) {
                        nodeList = nodeList.slice(0, 100);
                    }
                    for (let node of nodeList) {
                        await window.sleep(1000);
                        let evt = document.createEvent('CustomEvent');
                        evt.initCustomEvent(event, false, true, null);
                        try {
                            node.dispatchEvent(evt);
                        }
                        catch (e) {
                            console.error(e);
                        }
                    }
                }
            })();
        });


        // dom2 triger
        await page.evaluate(() => {
            function transmit_child(node, event, loop) {
                let _loop = loop + 1
                if (_loop > 4) {
                    return;
                }
                if (node.nodeType === 1) {
                    if (node.hasChildNodes) {
                        let index = parseInt(Math.random() * node.children.length, 10);
                        try {
                            node.children[index].dispatchEvent(event);
                        } catch (e) { }
                        let max = node.children.length > 5 ? 5 : node.children.length;
                        for (let count = 0; count < max; count++) {
                            let index = parseInt(Math.random() * node.children.length, 10);
                            transmit_child(node.children[index], event, _loop);
                        }
                    }
                }
            }

            // hook dom2 级事件监听
            window.add_even_listener_count_sec_auto = {};
            // record event func , hook addEventListener
            let old_event_handle = Element.prototype.addEventListener;
            Element.prototype.addEventListener = function (event_name, event_func, useCapture) {
                let name = "<" + this.tagName + "> " + this.id + this.name + this.getAttribute("class") + "|" + event_name;

                // 对每个事件设定最大的添加次数，防止无限触发，最大次数为5
                if (!window.add_even_listener_count_sec_auto.hasOwnProperty(name)) {
                    window.add_even_listener_count_sec_auto[name] = 1;
                } else {
                    window.add_even_listener_count_sec_auto[name] += 1;
                }

                if (window.add_even_listener_count_sec_auto[name] < 5) {

                    let evt = document.createEvent('CustomEvent');
                    evt.initCustomEvent(event_name, true, true, null);

                    if (event_name == "click" || event_name == "focus" || event_name == "mouseover" || event_name == "select") {
                        transmit_child(this, evt, 0);
                    }
                    if ((this.className && this.className.includes("close")) || (this.id && this.id.includes("close"))) {
                        return;
                    }

                    try {
                        this.dispatchEvent(evt);
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    return;
                }

                old_event_handle.apply(this, arguments);
            };

        });

        // inline trigger
        await page.evaluate(() => {
            (async function click_all_a_tag_javascript() {
                let nodeListHref = document.querySelectorAll("[href]");
                for (let node of nodeListHref) {
                    let attrValue = node.getAttribute("href");
                    if (attrValue.toLocaleLowerCase().startsWith("javascript:")) {
                        await window.sleep(100);
                        try {
                            eval(attrValue.substring(11));
                        }
                        catch (e) {
                            console.error(e);
                        }
                    }
                }
                let nodeListSrc = document.querySelectorAll("[src]");
                for (let node of nodeListSrc) {
                    let attrValue = node.getAttribute("src");
                    if (attrValue.toLocaleLowerCase().startsWith("javascript:")) {
                        await window.sleep(100);
                        try {
                            eval(attrValue.substring(11));
                        }
                        catch (e) {
                            console.error(e);
                        }
                    }
                }
            })()
        });


        // fill form
        await page.evaluate(() => {
            (async function fill_all_form() {
                // 填充表单
                let nodeList = document.querySelectorAll("form");
                for (let node of nodeList) {
                    let inputs = node.querySelectorAll("input");
                    for (let input of inputs) {

                        switch (input.type) {
                            case "":
                                input.value = "test";
                                break;
                            case "text":
                                input.value = "test";
                                break;
                            case "email":
                                input.value = "test@test.com";
                                break;
                            case "password":
                                input.value = "test";
                                break;
                            case "tel":
                                input.value = '12345678901';
                                break;
                            case "radio":
                                break;
                            case "checkbox":
                                input.select = true;
                                break;
                            case "submit":
                                break;
                            case "reset":
                                break;
                            case "hidden":
                                input.value = "test";
                                break;
                            case "file":
                                break;
                            case "image":
                                break;
                            default:
                                break;
                        }
                    }
                }

                // 设置 textarea
                let nodeListTextarea = document.querySelectorAll("textarea");
                for (let node of nodeListTextarea) {
                }

                // 设置 select
                let nodeListSelect = document.querySelectorAll("select");
                for (let node of nodeListSelect) {
                }

                // 提交表单
                let nodeListSubmit = document.querySelectorAll("[type=submit]");
                for (let node of nodeListSubmit) {
                    await window.sleep(100);
                    try {
                        node.click();
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
            })();
        });

        await sleep(3000);
    });


    const page = await browser.newPage();
    await page.goto(targetUrl.href, {
        waitUntil: [
            'load',
            'domcontentloaded',
            'networkidle0',
            'networkidle2'],
    });

    await page.type('input[name=username]', 'admin123', { delay: 20 });
    await page.type('input[name=password]', '123123', { delay: 20 });
    await page.click('button[type=submit]');

    // wait for sec
    await sleep(1000);

    // login success save cookie
    const cookies = await page.cookies();
    console.info("cookies are ", cookies);

    fs.writeFile('scope-cookie.json', JSON.stringify(cookies, null, 2), function (err) {
        if (err) throw err;
        console.log('completed write of cookies');
    });
    cluster.queue("http://127.0.0.1:8080/WebGoat/start.mvc#lesson/SqlInjectionAdvanced.lesson/4");

    await cluster.idle();
    await cluster.close();

    await browser.close();
})();