import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { renderMarkdown } from './markdown.js';

export async function createExtensions(config) {
  const filters = new Map();
  const generators = new Map();
  const renderers = new Map([['.md', { render: (source, context) => {
    const locale = context.document.locale;
    const base = context.config.i18n.translationsByLocale?.[context.config.i18n.defaultLocale];
    const selected = context.config.i18n.translationsByLocale?.[locale];
    return renderMarkdown(source, {
      ...context.config.markdown,
      taskLabels: {
        complete: selected?.markdownTaskComplete ?? base?.markdownTaskComplete ?? 'Task complete',
        incomplete: selected?.markdownTaskIncomplete ?? base?.markdownTaskIncomplete ?? 'Task incomplete'
      }
    });
  }, cacheable: true }]]);

  function registerFilter(name, fn) {
    if (typeof fn !== 'function') throw new TypeError('A filter must be a function');
    const list = filters.get(name) ?? [];
    list.push(fn);
    filters.set(name, list);
  }
  function registerGenerator(name, fn) {
    if (generators.has(name)) throw new Error('Generator already registered: ' + name);
    if (typeof fn !== 'function') throw new TypeError('A generator must be a function');
    generators.set(name, fn);
  }
  function registerRenderer(extension, fn) {
    if (typeof fn !== 'function') throw new TypeError('A renderer must be a function');
    const ext = extension.startsWith('.') ? extension.toLowerCase() : '.' + extension.toLowerCase();
    renderers.set(ext, { render: fn, cacheable: false });
  }

  const api = { registerFilter, registerGenerator, registerRenderer };
  const realRoot = await realpath(config.root);
  for (const pluginPath of config.plugins) {
    if (typeof pluginPath !== 'string' || !pluginPath.trim() || isAbsolute(pluginPath)) {
      throw new Error('Each plugin must be a non-empty relative module path');
    }
    const pluginFile = resolve(config.root, pluginPath);
    const pluginRelative = relative(config.root, pluginFile);
    if (pluginRelative === '..' || pluginRelative.startsWith('..' + sep) || isAbsolute(pluginRelative)) {
      throw new Error('Plugin paths must stay inside the project root: ' + pluginPath);
    }
    const realPluginFile = await realpath(pluginFile);
    const realPluginRelative = relative(realRoot, realPluginFile);
    if (realPluginRelative === '..' || realPluginRelative.startsWith('..' + sep) || isAbsolute(realPluginRelative)) {
      throw new Error('Plugin paths must resolve inside the project root, including through symbolic links: ' + pluginPath);
    }
    const url = pathToFileURL(pluginFile).href;
    const plugin = (await import(url)).default;
    if (typeof plugin !== 'function') throw new Error('Plugin must have a default function export: ' + pluginPath);
    await plugin(api);
  }

  return {
    generators,
    renderer(extension) {
      return renderers.get(extension.toLowerCase()) ?? null;
    },
    async filter(name, value, context = {}) {
      let current = value;
      for (const fn of filters.get(name) ?? []) {
        const next = await fn(current, context);
        if (next !== undefined) current = next;
      }
      return current;
    }
  };
}
