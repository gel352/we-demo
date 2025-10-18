这是用Node.js、WebSocket、uuid写的一个实时聊天

## 声明一下
本人是新手，写的不好，请见谅
功能上有很多个没有弄，你们可以自己去添加
只是实现一个局域网下实时聊天而已

## 运行
安装 依赖

``` sh
npm install ws uuid

```

注意请在server目录下, 或者打开终端输入

```sh
cd server
```
 安装好后再输入

 ``` sh
 node server.js
 ```
 显示服务器已开启，说明可以用

 推荐用这个vscode插件[Live Server (Five Server)](https://marketplace.visualstudio.com/items/?itemName=yandeu.five-server)来运行前端页面

 ## 局域网
使用这个插件后，下方控制台有个192.**.*.*:5500，这个就是局域网地址，可以在手机上打开，也可以在电脑上打开，然后输入这个地址就可以访问了