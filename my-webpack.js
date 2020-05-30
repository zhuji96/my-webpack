const fs = require("fs");
const path = require("path");
const babylon = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");

let ID = 0;

function createAsset(filename) {
	const content = fs.readFileSync(filename, "utf-8");

	const ast = babylon.parse(content, {
		sourceType: "module",
	});

	const dependencies = [];

	traverse(ast, {
		ImportDeclaration: ({ node }) => {
			// import message from './message.js'，
			// './message.js' === node.source.value
			dependencies.push(node.source.value);
		},
	});

	const id = ID++;

	// ES6 => ES5
	const { code } = babel.transformFromAstSync(ast, null, {
		presets: ["@babel/preset-env"],
	});

	return {
		id,
		filename,
		dependencies,
		code,
	};
}

// BFC
function createGraph(entry) {
	const mainAsset = createAsset(entry);

	const queue = [mainAsset];

	for (const asset of queue) {
		const dirname = path.dirname(asset.filename);

		// {"./message.js" : 1}
		asset.mapping = {};

		asset.dependencies.forEach((relativePath) => {
			const absolutePath = path.join(dirname, relativePath);

			const child = createAsset(absolutePath);

			asset.mapping[relativePath] = child.id;

			queue.push(child);
		});
	}
	return queue;
}

function bundle(graph) {
	let modules = "";

	graph.forEach((mod) => {
		modules += `${mod.id}:[
      function (require, module, exports){
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`;
	});

	// 模拟cjs模块加载，执行，导出操作。
	const result = `
    (function(modules){
      function require(id){
        const [fn, mapping] = modules[id];
        function localRequire(relativePath){
          return require(mapping[relativePath]);
        }
        const module = {exports:{}};
        // run code
        fn(localRequire,module,module.exports);
        return module.exports;
      }
      // run entry
      require(0);
    })({${modules}})
  `;

	return result;
}

const graph = createGraph("./example/entry.js");
const ret = bundle(graph);

fs.writeFileSync("./bundle.js", ret);
