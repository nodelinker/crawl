

var jsTrigger = `
(async function trigger_all_inline_event(){
	let eventNames = ["onabort", "onblur", "onchange", "onclick", "ondblclick", "onerror", "onfocus", "onkeydown", "onkeypress", "onkeyup", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onreset", "onresize", "onselect", "onsubmit", "onunload"];
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
			catch {}
		}
	}
})();
`;