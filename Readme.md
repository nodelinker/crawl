# 吃草了啊喂

一个基于chrome headless的扫描器爬虫

## todo

- [x] dom0 event triger
- [x] dom2 event triger
- [x] inline tag event triger
- [x] form triger
- [x] simple url filter
- [x] webgoat 适配
- [x] 注释匹配url
- [x] js匹配url
- [x] url布隆过滤
- [x] 识别过滤动态url
- [ ] 识别过滤伪静态url
- [x] 获取comments link
- [ ] 获取object link
- [x] 增加a标签src, href, data-url, data-href
- [x] 处理 30x 跳转
- [ ] 处理 40x 认证弹窗
- [x] 处理 header
- [x] handle javascript alert
- [x] 代理模式
- [ ] button事件触发，这个比较纠结。点Button会改变页面逻辑走向，在某种场景下会导致页面爬取覆盖率变低。暂时还是不加了
- [ ] handle basic auth



## webgoat result

webgoat-combined-all.txt

webgoat-combined-filter.txt

## 问题

webgoat 太慢导致出了大量的 Navigation failed because browser has disconnected!
内网环境非常少，一般都是服务端不响应导致的。强行处理会出现各种crash目前建议就不处理了。
