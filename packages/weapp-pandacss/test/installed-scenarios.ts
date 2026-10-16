import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { run } from './packed-consumer.ts'

// The runtime-only named recipe choices below never appear in the extraction
// source. Only staticCss can include their finite variant set in the output.
export async function writeInstalledScenario(root: string) {
  await fs.mkdir(path.join(root, 'src'), { recursive: true })
  await fs.writeFile(path.join(root, 'panda.config.mjs'), `
    import {weappPanda} from 'weapp-pandacss/panda';
    export default {plugins:[weappPanda()], presets:['@pandacss/preset-base','@pandacss/preset-panda'],
      include:['./src/styles.mjs'],outdir:'styled-system',outExtension:'mjs',forceImportExtension:true,
      staticCss:{recipes:{runtimeBadge:[{tone:['neutral','accent'],active:['true','false']}] }},
      theme:{extend:{tokens:{colors:{brand:{value:'#2463eb'}},spacing:{probe:{value:'1rem'}}},
        recipes:{runtimeBadge:{className:'runtime/badge',base:{padding:'probe'},
          variants:{tone:{neutral:{color:'gray.700'},accent:{color:'brand'},ungenerated:{color:'#ff00ff'}},active:{true:{fontWeight:'bold'},false:{fontWeight:'normal'}}},
          defaultVariants:{tone:'neutral',active:false},compoundVariants:[{tone:'accent',active:true,css:{backgroundColor:'yellow.100'}}]}},
        slotRecipes:{runtimeCard:{className:'runtime/card',slots:['root','label'],base:{root:{padding:'2'},label:{color:'gray.700'}},
          variants:{tone:{neutral:{root:{backgroundColor:'gray.100'},label:{color:'gray.700'}},accent:{root:{backgroundColor:'blue.100'},label:{color:'brand'}}}},
          defaultVariants:{tone:'neutral'},staticCss:[{tone:['neutral','accent']}]}}
      }}};
  `)
  await fs.writeFile(path.join(root, 'src/styles.mjs'), `
    import {css,cva,sva} from '../styled-system/css/index.mjs';
    import {token} from '../styled-system/tokens/index.mjs';
    export const atomic=css({color:'brand',padding:'probe',fontSize:'1rem',width:'32px'});
    export const dynamic=css({color:'var(--runtime-color)'});
    export const fromToken=css({padding:token.var('spacing.probe')});
    export const inline=cva({base:{padding:'2'},variants:{tone:{neutral:{color:'gray.700'},accent:{color:'brand'}},active:{true:{fontWeight:'bold'},false:{fontWeight:'normal'}}},defaultVariants:{tone:'neutral',active:false},compoundVariants:[{tone:'accent',active:true,css:{backgroundColor:'yellow.100'}}]});
    export const inlineSlots=sva({className:'inline/card',slots:['root','label'],base:{root:{padding:'2'},label:{color:'brand'}},variants:{active:{true:{root:{fontWeight:'bold'}},false:{root:{fontWeight:'normal'}}}},defaultVariants:{active:false}});
    export const extracted=[inline({tone:'accent',active:true}),inline({}),inlineSlots({}),inlineSlots({active:true})];
  `)
  await fs.writeFile(path.join(root, 'src/imported.css'), `@layer base {
    .layer-normal {color:#d02020} .layer-important {color:#208020!important} .a\\.b {color:#112233} .a_wp_b {color:#445566}
    .unit-layout {position:relative;width:7.5rem;height:3.75rem;margin-top:0.5rem;margin-bottom:0.5rem}
    .negative-unit {position:absolute;left:0;top:0;width:1rem;height:0.5rem;margin-left:-0.25rem;margin-top:-0.125rem;background-color:#2463eb}
    .calc-unit {position:absolute;left:0;top:1.5rem;width:calc(100% - 1rem);height:0.5rem;margin-left:0.5rem;background-color:#db2777}
  }`)
  await fs.writeFile(path.join(root, 'src/app.css'), '@layer reset,base,tokens,recipes,utilities;\n@import "./imported.css";\n@layer utilities {.layer-normal {color:#2040c0} .layer-important {color:#d02020!important}}')
  await fs.mkdir(path.join(root, 'typed'), { recursive: true })
  await fs.writeFile(path.join(root, 'typed/consumer.mts'), `
    import assert from 'node:assert/strict';
    import {defineConfig} from '@pandacss/dev';
    import {postcssPlugin,composeUnitRules,unitPresets,type IPostcssPluginOptions,type UnitConversionOptions} from 'weapp-pandacss';
    import plugin from 'weapp-pandacss/postcss';
    import {weappPanda} from 'weapp-pandacss/panda';
    import {encodeClassName} from 'weapp-pandacss/runtime';
    import {createPortableRuntime,encodeClassList} from '@weapp-pandacss/runtime';
    import {css,cva,sva,cx} from '../styled-system/css/index.mjs';
    import {token} from '../styled-system/tokens/index.mjs';
    import {box} from '../styled-system/patterns/index.mjs';
    import {runtimeBadge,runtimeCard} from '../styled-system/recipes/index.mjs';
    const units:UnitConversionOptions={rules:composeUnitRules(unitPresets.remToRpx({rootValue:32}))};
    const options:IPostcssPluginOptions={panda:{cwd:'.',configPath:'panda.config.mjs'},units,cascadeLayers:{mode:'ordered',onConflict:'error'}};
    defineConfig({plugins:[weappPanda()]});plugin(options);postcssPlugin(options);
    const inline=cva({variants:{tone:{neutral:{color:'gray.700'},accent:{color:'brand'}},active:{true:{fontWeight:'bold'},false:{fontWeight:'normal'}}},defaultVariants:{tone:'neutral',active:false}});
    const slots=sva({slots:['root','label'],base:{label:{color:'brand'}},variants:{active:{true:{root:{fontWeight:'bold'}}}},defaultVariants:{active:true}});
    const result:string=cx(css({color:'brand',padding:'probe'}),inline({tone:'accent',active:true}),runtimeBadge({tone:'accent',active:true}),box({padding:'2'}));
    const tokenValue:string=token('colors.brand');const tokenVariable:string=token.var('spacing.probe');
    const inlineMap:readonly string[]=inline.variantMap.tone;const namedMap:readonly string[]=runtimeBadge.variantMap.tone;
    const inlineRaw=inline.raw({tone:'accent'});const namedRaw=runtimeBadge.raw({tone:'accent'});
    const split=runtimeBadge.splitVariantProps({tone:'accent',id:'typed'});const defaults=runtimeBadge.getVariantProps({});
    const slotClass:string=slots({active:true}).label;const namedSlot:string=runtimeCard({tone:'accent'}).label;
    const encoded:string=createPortableRuntime().encodeClassList(encodeClassList(encodeClassName('a.b')));
    assert(result&&tokenValue&&tokenVariable&&inlineMap.length&&namedMap.length&&inlineRaw&&namedRaw&&split&&defaults&&slotClass&&namedSlot&&encoded);
    // @ts-expect-error Generated named variants reject unsupported selections.
    runtimeBadge({tone:'unsupported'});
    // @ts-expect-error Public options reject invalid cascade layer modes.
    plugin({cascadeLayers:{mode:'unsupported'}});
    process.stdout.write('typed ESM consumer passed\\n');
  `)
  await fs.writeFile(path.join(root, 'typed/consumer.cts'), `
    import assert = require('node:assert/strict');
    import api = require('weapp-pandacss');
    import plugin = require('weapp-pandacss/postcss');
    import panda = require('weapp-pandacss/panda');
    import runtime = require('weapp-pandacss/runtime');
    import standalone = require('@weapp-pandacss/runtime');
    const result:string=runtime.encodeClassList(standalone.createPortableRuntime().encodeClassName('a.b'));
    const options:api.IPostcssPluginOptions={imports:false,panda:false,adapter:false,units:{rules:api.composeUnitRules(api.unitPresets.remToRpx({rootValue:32}))}};
    plugin(options);api.postcssPlugin(options);assert.equal(panda.weappPanda().name,'weapp-pandacss');assert(result);
    process.stdout.write('typed CJS consumer passed\\n');
  `)
  // eslint-disable-next-line ts/no-use-before-define -- Called after module initialization.
  await fs.writeFile(path.join(root, 'build-scenario.mjs'), createScenarioScript())
}

function createScenarioScript() {
  return String.raw`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import plugin from 'weapp-pandacss/postcss';
import {encodeClassName} from 'weapp-pandacss/runtime';
import {weappPanda} from 'weapp-pandacss/panda';
const require=createRequire(import.meta.url);
for (const name of ['weapp-pandacss','weapp-pandacss/postcss','weapp-pandacss/panda','weapp-pandacss/runtime','@weapp-pandacss/runtime']) {
  const esm=await import(name); const cjs=require(name); assert(esm && cjs,name+' exports');
}
assert.equal(weappPanda().name,'weapp-pandacss');
assert.equal(require('weapp-pandacss/runtime').encodeClassName,require('@weapp-pandacss/runtime').encodeClassName);
const from=path.resolve('src/app.css');
const input=await fs.readFile(from,'utf8');
const mini=await postcss([plugin({units:{rules:[{from:'rem',to:'rpx',factor:32},{from:'px',to:'rpx',factor:1}]}})]).process(input,{from,to:path.resolve('output.wxss'),map:{inline:false}});
const web=await postcss([plugin({target:'web'})]).process(input,{from,to:path.resolve('output.css')});
await fs.writeFile('output.wxss',mini.css); await fs.writeFile('output.wxss.map',mini.map.toString()); await fs.writeFile('output.css',web.css);
assert(!/@import|@layer|:not\(n\)/.test(mini.css));
assert.match(mini.css,/rpx/);
assert(mini.messages.some(x=>x.type==='dependency'&&x.file===path.resolve('src/imported.css')));
assert(mini.map.toJSON().sourcesContent.some(x=>x.includes('layer-normal')));
const {css}=await import('./styled-system/css/index.mjs');
const {token}=await import('./styled-system/tokens/index.mjs');
const {runtimeBadge,runtimeCard}=await import('./styled-system/recipes/index.mjs');
const {atomic,dynamic,fromToken,inline,inlineSlots}=await import('./src/styles.mjs');
const neutral=runtimeBadge(); const accent=runtimeBadge({tone:'accent',active:true});
const slotsNeutral=runtimeCard(); const slotsAccent=runtimeCard({tone:'accent'});
const inlineSlotsNeutral=inlineSlots(); const inlineSlotsAccent=inlineSlots({active:true});
const classes={atomic,dynamic,fromToken,inlineDefault:inline(),inlineAccent:inline({tone:'accent',active:true}),neutral,accent,
  slotsNeutral,slotsAccent,inlineSlotsNeutral,inlineSlotsAccent,inlineSlots:inlineSlotsAccent,layerNormal:'layer-normal',layerImportant:'layer-important',collisionDot:encodeClassName('a.b'),collisionLiteral:encodeClassName('a_wp_b'),layoutParent:'unit-layout',negativeUnit:'negative-unit',calcUnit:'calc-unit'};
const markers=new Set(Object.values(inlineSlots.classNameMap));
function collectClasses(source){const result=new Set();postcss.parse(source).walkRules(rule=>{for(const match of rule.selector.matchAll(/\.([a-z_][\w-]*)/gi))result.add(match[1])});return result}
const miniClasses=collectClasses(mini.css);const webClasses=collectClasses(web.css);
const cliClasses=[];
for(const name of ['cli.css','cli-build.css']){const source=await fs.readFile(name,'utf8');assert.match(source,/@layer/);const converted=await postcss([plugin({panda:false,imports:false})]).process(source,{from:undefined});cliClasses.push(collectClasses(converted.css))}
const authoredClasses=new Set(['layer-normal','layer-important',classes.collisionDot,classes.collisionLiteral,classes.layoutParent,classes.negativeUnit,classes.calcUnit]);
function checkClass(value) {for(const item of value.split(' ')){assert.match(item,/^[a-z_][\w-]*$/i); if(markers.has(item))continue; assert(miniClasses.has(item), 'missing CSS: '+item); assert(webClasses.has(item), 'missing web CSS: '+item);if(!authoredClasses.has(item))for(const names of cliClasses)assert(names.has(item),'CLI build missing CSS: '+item)}}
for(const value of Object.values(classes)) {if(typeof value==='string')checkClass(value);else Object.values(value).forEach(checkClass)}
assert.notEqual(classes.collisionDot,classes.collisionLiteral);
assert.notEqual(neutral,accent);assert.notDeepEqual(slotsNeutral,slotsAccent);
assert.notDeepEqual(inlineSlotsNeutral,inlineSlotsAccent);
assert.deepEqual(classes.inlineSlots,classes.inlineSlotsAccent);
assert.deepEqual(css.raw({color:'brand'}),{color:'brand'});
assert.deepEqual(inline.raw({tone:'accent',active:true}),{padding:'2',color:'brand',fontWeight:'bold',backgroundColor:'yellow.100'});
assert.deepEqual(inline.variantKeys,['tone','active']);
assert.deepEqual(inline.variantMap,{tone:['neutral','accent'],active:['true','false']});
assert.deepEqual(inline.splitVariantProps({tone:'accent',active:true,id:'probe'}),[{tone:'accent',active:true},{id:'probe'}]);
assert.deepEqual(inline.getVariantProps({tone:'accent'}),{tone:'accent',active:false});
assert.deepEqual([...runtimeBadge.variantKeys].sort(),['active','tone']);
assert.deepEqual(runtimeBadge.variantMap,{tone:['accent','neutral','ungenerated'],active:['false','true']});
assert.deepEqual(runtimeBadge.splitVariantProps({tone:'accent',id:'probe'}),[{tone:'accent'},{id:'probe'}]);
assert.equal(runtimeBadge.getVariantProps({tone:'accent'}).active,false);
// Named recipe raw is a selection object; inline raw is resolved style data.
assert.equal(runtimeBadge.raw({tone:'accent'}).tone,'accent');
assert.equal(runtimeCard.getVariantProps({}).tone,'neutral');
assert.deepEqual(runtimeCard.splitVariantProps({tone:'accent',id:'slot'}),[{tone:'accent'},{id:'slot'}]);
assert.deepEqual(runtimeCard.variantMap,{tone:['accent','neutral']});
assert.deepEqual(runtimeCard.raw({tone:'accent'}),{tone:'accent'});
assert.deepEqual(inlineSlots.getVariantProps({}),{active:false});
assert.deepEqual(inlineSlots.variantMap,{active:['true','false']});
assert.deepEqual(inlineSlots.splitVariantProps({active:true,id:'slot'}),[{active:true},{id:'slot'}]);
const unitDeclarations={};postcss.parse(mini.css).walkRules(rule=>{for(const [name,className]of Object.entries({parent:classes.layoutParent,negative:classes.negativeUnit,calc:classes.calcUnit})){if(rule.selector!=='.'+className)continue;unitDeclarations[name]??={};rule.walkDecls(declaration=>{unitDeclarations[name][declaration.prop]=declaration.value})}});
assert.equal(unitDeclarations.parent.width,'240rpx');assert.equal(unitDeclarations.parent.height,'120rpx');
assert.equal(unitDeclarations.negative['margin-left'],'-8rpx');assert.equal(unitDeclarations.negative['margin-top'],'-4rpx');assert.equal(unitDeclarations.negative.width,'32rpx');assert.equal(unitDeclarations.negative.height,'16rpx');
assert.equal(unitDeclarations.calc.width,'calc(100% - 32rpx)');assert.equal(unitDeclarations.calc.top,'48rpx');assert.equal(unitDeclarations.calc['margin-left'],'16rpx');assert.equal(unitDeclarations.calc.height,'16rpx');
assert.equal(token('colors.brand'),'#2463eb');
assert.match(token.var('spacing.probe'),/^var\(--[\w-]+\)$/);
assert(mini.css.includes('var(--runtime-color)'));
const missing=runtimeBadge({tone:'ungenerated'}).split(' ').filter(x=>!neutral.split(' ').includes(x));
assert(missing.length>0);for(const name of missing)assert(!miniClasses.has(name),'runtime-only choice must not create CSS');
const modeInput='@layer a,b;@layer b{:root{--mode:blue}.mode{margin:1rem;color:blue}}@layer a{.mode{margin:2rem;color:red}}';
const modes={};
async function mode(name,options,source=modeInput,file=undefined){const result=await postcss([plugin(options)]).process(source,{from:file});modes[name]=result.css;return result.css}
const ordered=await mode('default-ordered',undefined);assert(!ordered.includes('@layer'));assert(ordered.indexOf('color:red')<ordered.indexOf('color:blue'));assert(ordered.includes('page'));
const preservedWeb=await mode('target-web',{target:'web'});assert(preservedWeb.includes('@layer'));assert(preservedWeb.includes(':root'));assert(!preservedWeb.includes('page'));
const legacy=await mode('explicit-legacy',{cascadeLayers:{mode:'legacy'},removeNegationPseudoClass:false});assert(!legacy.includes('@layer'));assert(legacy.includes(':not(n)'));
const implicit=await mode('implicit-legacy',{removeNegationPseudoClass:false});assert.equal(implicit,legacy);
const disabledInput='@import "./missing.css";'+modeInput;
assert.equal(await mode('disabled',{disabled:true,panda:{cwd:process.cwd(),configPath:'missing.config.mjs'},units:{rules:[{from:'rem',to:'rpx',factor:32}]}},disabledInput,from),disabledInput);
const withoutAdapter=await mode('adapter-false',{adapter:false},input,from);assert(!withoutAdapter.includes('@import'));assert(withoutAdapter.includes('@layer'));assert(withoutAdapter.includes('layer-normal'));assert(!withoutAdapter.includes('.'+classes.collisionDot));assert(!withoutAdapter.includes('weapp-pandacss:portable'));
const unitsOnly=await mode('units-only',{adapter:false,imports:false,panda:false,units:{rules:[{from:'rem',to:'rpx',factor:32}]}});assert(unitsOnly.includes('@layer'));assert(unitsOnly.includes(':root'));assert(unitsOnly.includes('margin:32rpx'));assert(!unitsOnly.includes('margin:1rem'));
const importsOnly=await mode('imports-only',{adapter:false,panda:false},'@import "./imported.css";',from);assert(!importsOnly.includes('@import'));assert(importsOnly.includes('@layer'));assert(importsOnly.includes('layer-normal'));assert(!importsOnly.includes('weapp-pandacss:portable'));
await fs.writeFile('modes.json',JSON.stringify(modes,null,2));
const negative=[];
const diagnostics=[];
async function rejects(name,callback,pattern,expected){let failure;try{await callback()}catch(error){failure=error}assert(failure instanceof Error,name+' must fail');assert.match(failure.message,pattern);for(const [key,value]of Object.entries(expected))assert.equal(failure[key],value,name+'.'+key);if(expected.code){assert.equal(failure.diagnostic.code,expected.code);assert.equal(failure.diagnostic.severity,'error');assert.deepEqual(failure.diagnostic.source,{file:expected.file,line:expected.line,column:expected.column});assert(failure.diagnostics.some(value=>value===failure.diagnostic))}negative.push(name);diagnostics.push({name,error:failure.name,message:failure.message,file:failure.file,line:failure.line,column:failure.column,plugin:failure.plugin,code:failure.code,diagnostic:failure.diagnostic})}
await rejects('missing config',()=>postcss([plugin({panda:{cwd:process.cwd(),configPath:'missing.config.mjs'}})]).process('@layer utilities;',{from}),/missing.config.mjs/,{name:'Error'});
await rejects('missing import',()=>postcss([plugin({panda:false})]).process('@import "./missing.css";',{from}),/Failed to find|ENOENT/,{name:'CssSyntaxError',file:from,line:1,column:1,plugin:'postcss-import'});
await rejects('virtual relative import',()=>postcss([plugin({panda:false})]).process('@import "./imported.css";',{from:undefined}),/physical|imports.root/,{name:'CssSyntaxError',file:undefined,line:1,column:1,plugin:'weapp-pandacss-pipeline'});
await fs.writeFile('src/raw.scss','$color:red;.x{color:$color}');
await rejects('raw preprocessor',()=>postcss([plugin({panda:false})]).process('@import "./raw.scss";',{from}),/raw preprocessor.*raw.scss/,{name:'CssSyntaxError',file:from,line:1,column:1,plugin:'weapp-pandacss-pipeline'});
await rejects('ordered legacy contradiction',()=>plugin({cascadeLayers:{mode:'ordered'},removeNegationPseudoClass:true}),/cannot be combined/,{name:'Error',file:undefined});
const {default:officialPanda}=await import('@pandacss/dev/postcss');
const official=officialPanda({cwd:process.cwd(),configPath:'panda.config.mjs'});
await rejects('duplicate Panda',()=>postcss([official,plugin()]).process('.x{}',{from}),/registered twice/,{name:'CssSyntaxError',file:from,line:1,column:1,plugin:'weapp-pandacss-pipeline'});
await rejects('reversed Panda',()=>postcss([plugin({panda:false}),official]).process('.x{}',{from}),/must run before/,{name:'CssSyntaxError',file:from,line:1,column:1,plugin:'weapp-pandacss-pipeline'});
for(const [name,input,pattern,code,column] of [
  ['illegal variable','.x{color:var(--中文)}',/Unsupported mini-program CSS variable/,undefined,4],
  ['nesting','.x{.y{color:red}}',/LAYER_NESTING/,'LAYER_NESTING',4],
  ['revert-layer','.x{color:revert-layer}',/LAYER_REVERT/,'LAYER_REVERT',4],
  ['strict specificity','@layer a,b;@layer a{#id .x{color:red}}@layer b{.x{color:blue}}',/LAYER_SPECIFICITY/,'LAYER_SPECIFICITY',48],
]){const file=path.resolve('src/negative-'+name.replaceAll(' ','-')+'.css');await fs.writeFile(file,'/* imported diagnostic source */\n'+input);await rejects(name,()=>postcss([plugin({panda:false,cascadeLayers:{onConflict:'error'}})]).process('@import "./'+path.basename(file)+'";',{from}),pattern,{name:'CssSyntaxError',file,line:2,column,plugin:code?'weapp-pandacss-ordered-layers':'weapp-pandacss-portable-naming',...(code?{code}:{})})}
const output={node:process.version,panda:require('@pandacss/dev/package.json').version,classes,slotMarkers:[...markers],unitDeclarations,negative,diagnostics,modes:Object.keys(modes),
  runtimeStyle:{neutral:'--runtime-color:#2463eb',accent:'--runtime-color:#db2777'},
  tokens:{brand:token('colors.brand'),gray700:token('colors.gray.700'),gray100:token('colors.gray.100'),blue100:token('colors.blue.100'),yellow100:token('colors.yellow.100'),spacing2:token('spacing.2'),spacing:token.var('spacing.probe')}};
await fs.writeFile('scenario.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
`
}

export async function runInstalledScenario(root: string, node = process.execPath) {
  const commands: { name: string, node: string, args: string[] }[] = []
  const step = async (name: string, args: string[]) => {
    const output = await run(node, args, { cwd: root, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }).catch(async (error: Error & { stdout?: string, stderr?: string }) => {
      await fs.writeFile(path.join(root, `${name}.log`), (error.stdout ?? '') + (error.stderr ?? '') + error.message)
      throw new Error(`${name} failed; inspect ${path.join(root, `${name}.log`)}`, { cause: error })
    })
    await fs.writeFile(path.join(root, `${name}.log`), output.stdout + output.stderr)
    commands.push({ name, node, args })
    await fs.writeFile(path.join(root, 'commands.json'), JSON.stringify(commands, null, 2))
    return output
  }
  const panda = path.join(root, 'node_modules/@pandacss/dev/bin.js')
  await step('panda-codegen', [panda, 'codegen'])
  assert.match(await fs.readFile(path.join(root, 'styled-system/helpers.mjs'), 'utf8'), /weapp-pandacss:portable-v1/)
  await step('panda-cssgen', [panda, 'cssgen', '--outfile', 'cli.css'])
  await step('panda-build', [panda, 'build', '--outfile', 'cli-build.css'])
  const compiler = path.join(root, 'node_modules/typescript/bin/tsc')
  const compilerVersion = (await step('typescript-version', [compiler, '--version'])).stdout.trim()
  assert.equal(compilerVersion, 'Version 6.0.3')
  const typeArguments = ['--strict', '--module', 'nodenext', '--target', 'es2022', '--types', 'node', '--rootDir', 'typed', 'typed/consumer.mts', 'typed/consumer.cts']
  let upstreamDeclarationDiagnostics: string[] = []
  try {
    // TypeScript 6 refuses a file list when a fixture tsconfig is present
    // unless the declaration-only probe explicitly opts out of config loading.
    // The consumer check below uses the same explicit compiler options and
    // skipLibCheck policy, while also opting out of the fixture config to
    // satisfy TypeScript 6's file-list rule.
    await run(node, [compiler, '--noEmit', '--ignoreConfig', ...typeArguments], { cwd: root, timeout: 120_000 })
  }
  catch (error) {
    const failure = error as { stdout: string, stderr: string }
    await fs.writeFile(path.join(root, 'upstream-declarations.log'), failure.stdout + failure.stderr)
    upstreamDeclarationDiagnostics = failure.stdout.trim().split('\n').filter(Boolean)
    assert(upstreamDeclarationDiagnostics.length > 0)
    assert(upstreamDeclarationDiagnostics.every(line => /node_modules\/.*@pandacss\/types\/dist\/index\.d\.ts.*error TS2308:.*(?:Recursive|LiteralUnion|Primitive|Token)/.test(line)), 'Unexpected declaration error: inspect upstream-declarations.log')
  }
  await step('consumer-typecheck', [compiler, '--skipLibCheck', '--ignoreConfig', '--outDir', 'built', '--listFiles', ...typeArguments])
  await step('typed-esm', ['built/consumer.mjs'])
  await step('typed-cjs', ['built/consumer.cjs'])
  const output = await step('build-scenario', ['build-scenario.mjs'])
  const result = JSON.parse(await fs.readFile(path.join(root, 'scenario.json'), 'utf8'))
  assert.equal(result.negative.length, 11)
  result.validation = { typescript: compilerVersion, commands, typecheckPolicy: 'Strict consumer checking with skipLibCheck; the separate full declaration check permits only the recorded Panda TS2308 duplicate exports.', upstreamDeclarationDiagnostics }
  await fs.writeFile(path.join(root, 'scenario.json'), JSON.stringify(result, null, 2))
  await fs.writeFile(path.join(root, 'build.log'), output.stdout + output.stderr)
  return result
}
