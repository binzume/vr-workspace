"use strict";

function getJson(url,f){
	requestJson('GET', url, f).send();
}

function requestJson(method, url, f){
	var xhr = new XMLHttpRequest();
	xhr.open(method, url);
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4) return;
		if (f) {
			if (xhr.status == 200) {
				f(JSON.parse(xhr.responseText))
			} else {
				f(undefined)
			}
		}
	};
	return xhr;
}

function element_append(e, value) {
	if (value instanceof Array) {
		for (var i = 0; i < value.length; i++) {
			element_append(e, value[i]);
		}
		return;
	}
	if (typeof value == 'string') {
		value = document.createTextNode(value);
	}
	e.appendChild(value);
}

function element_clear(e) {
	while (e.firstChild) {
	    e.removeChild(e.firstChild);
	}
}

function element(tag, children, attr) {
	var e = document.createElement(tag);
	if (children) {
		element_append(e, children);
	}
	if (typeof(attr) == "function") {
		attr(e);
	} else if (typeof(attr) == "object") {
		for (var key in attr) {
			e[key] = attr[key];
		}
	}
	return e;
}
