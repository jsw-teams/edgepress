export const deviceProfiles = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, touch: false },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, mobile: true, touch: true },
  { name: 'tablet', width: 820, height: 1180, deviceScaleFactor: 2, mobile: true, touch: true }
];

// CDP input targets only the isolated headless browser, never the user's desktop.
async function key(send, name, modifiers = 0) {
  const code = name === 'Enter' ? 13 : 9;
  await send('Input.dispatchKeyEvent', { type: name === 'Enter' ? 'keyDown' : 'rawKeyDown',
    key: name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers,
    ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name,
    windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers });
}

async function evaluate(send, fn) {
  const result = await send('Runtime.evaluate', { expression: '(' + fn.toString() + ')()', returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser audit evaluation failed');
  return result.result.value;
}

export async function auditBrowser(send, profile) {
  const checks = [];
  const check = (group, name, passed, detail = '') => checks.push({ group, name, passed: Boolean(passed), ...(detail ? { detail } : {}) });
  const trace = [];
  const previous = await evaluate(send, () => {
    const manager = document.querySelector('[data-consent-ui]');
    const display = manager?.style.display;
    if (manager) manager.style.display = 'none';
    const candidates = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')];
    const visual = element => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.borderColor, style.color, style.textDecorationLine].join('|');
    };
    window.__edgepressKeyboardAudit = { candidates, elements: [...document.querySelectorAll('*')], visual,
      before: new Map(candidates.map(element => [element, visual(element)])) };
    document.activeElement?.blur();
    return { display: display ?? '', href: location.href };
  });
  try {
    const measured = await evaluate(send, () => ({ width: innerWidth, density: devicePixelRatio, touch: navigator.maxTouchPoints,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
      mainCount: document.querySelectorAll('main,[role="main"]').length,
      h1Count: document.querySelectorAll('h1').length,
      heading: document.querySelector('h1')?.textContent.trim() || '',
      language: document.documentElement.lang,
      schemes: { dark: matchMedia('(prefers-color-scheme: dark)').matches }
    }));
    check('device', 'Viewport matches the emulated device', measured.width === profile.width, String(measured.width));
    check('device', 'Pixel density matches the emulated device', Math.abs(measured.density - profile.deviceScaleFactor) < .01);
    check('device', profile.touch ? 'Mobile touch emulation exposes five touch points' : 'Native desktop touch capability is recorded',
      profile.touch ? measured.touch === 5 : true, String(measured.touch));
    check('device', 'No page overflow at this device size', !measured.overflow);
    check('device', 'System color preference is emulated', measured.schemes.dark === (profile.colorScheme === 'dark'));
    check('structure', 'One main landmark', measured.mainCount === 1);
    check('structure', 'One page-level h1', measured.h1Count === 1);
    check('structure', 'Document language is declared', measured.language.trim());

    const { nodes } = await send('Accessibility.getFullAXTree');
    const exposed = nodes.filter(node => !node.ignored);
    const role = node => node.role?.value;
    const name = node => String(node.name?.value || '').trim();
    check('semantics', 'Main landmark is exposed to assistive technology', exposed.filter(node => role(node) === 'main').length === 1);
    check('semantics', 'Page heading has its accessible name and level', exposed.some(node => role(node) === 'heading' &&
      name(node) === measured.heading && node.properties?.some(property => property.name === 'level' && property.value.value === 1)));
    const navigation = exposed.filter(node => role(node) === 'navigation');
    check('semantics', 'Exposed navigation landmarks have names', navigation.every(node => name(node)));
    const namedRoles = new Set(['button', 'link', 'combobox', 'textbox', 'searchbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'image']);
    const unnamed = exposed.filter(node => namedRoles.has(role(node)) && !name(node));
    check('semantics', 'Exposed controls and meaningful images have names', unnamed.length === 0,
      unnamed.length ? unnamed.map(node => role(node)).join(', ') : '');

    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const focus = () => evaluate(send, async () => {
      const element = document.activeElement;
      if (!element || element === document.body || element === document.documentElement) return null;
      // Native Tab can start a smooth scroll; observe its result without scrolling for it.
      await new Promise(resolve=>{
        const started=performance.now();
        const visible=()=>{const box=element.getBoundingClientRect();if((box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth)||performance.now()-started>1500)return resolve();requestAnimationFrame(visible);};
        visible();
      });
      const { elements, before, visual } = window.__edgepressKeyboardAudit;
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      const transparent = value => value === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(value);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && !transparent(style.outlineColor);
      const indicator = outline || style.boxShadow !== 'none' || (before.has(element) && before.get(element) !== visual(element));
      const hidden = element.closest('[hidden],[inert],[aria-hidden="true"]');
      return { index: elements.indexOf(element), tag: element.tagName.toLowerCase(),
        name: (element.getAttribute('aria-label') || element.innerText || element.labels?.[0]?.textContent || '').trim().slice(0, 160),
        visible: !hidden && style.visibility === 'visible' && style.display !== 'none' && box.width > 0 && box.height > 0 &&
          box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth,
        indicator, skip: element.matches('a[href^="#"]') &&
          document.getElementById(element.getAttribute('href').slice(1))?.matches('main,[role="main"]') };
    });
    let reverseChecked = false;
    let unexpectedRepeat = false;
    for (let step = 0; step < 12; step += 1) {
      await key(send, 'Tab');
      const current = await focus();
      if (!current) break; // Normal wrap through browser chrome is not a focus trap.
      if (trace.length && current.index === trace[0].index) {
        // Mobile browser chrome may not appear as a focus stop. A natural wrap
        // is valid only after visiting all currently tabbable page controls.
        const expected = await evaluate(send, () => {
          const { candidates, elements } = window.__edgepressKeyboardAudit;
          const visible = candidates.filter(element => {
            const style = getComputedStyle(element), box = element.getBoundingClientRect();
            return element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden],[inert]') &&
              style.visibility === 'visible' && box.width > 0 && box.height > 0;
          });
          return visible.filter(element => {
            if (!element.matches('input[type="radio"]') || !element.name) return true;
            const group = visible.filter(other => other.matches('input[type="radio"]') && other.name === element.name && other.form === element.form);
            return element === (group.find(other => other.checked) || group[0]);
          }).map(element => elements.indexOf(element));
        });
        const visited = new Set(trace.map(item => item.index));
        const missing = expected.filter(index => !visited.has(index));
        check('keyboard', 'Native page wrap does not skip tabbable controls', missing.length === 0, missing.length ? String(missing.length) + ' unvisited controls' : '');
        break;
      }
      if (trace.some(item => item.index === current.index)) { unexpectedRepeat = true; break; }
      trace.push(current);
      check('keyboard', 'Tab step ' + (step + 1) + ' lands on visible content', current.visible, current.name);
      check('keyboard', 'Tab step ' + (step + 1) + ' has a visible focus indicator', current.indicator, current.name);
      if (step === 1) {
        await key(send, 'Tab', 8); // Shift modifier, scoped to CDP.
        const reverse = await focus();
        check('keyboard', 'Shift+Tab returns to the previous focus target', reverse?.index === trace[0].index);
        reverseChecked = true;
        await key(send, 'Tab');
      }
    }
    check('keyboard', 'Forward and backward keyboard navigation are available', trace.length >= 2 && reverseChecked);
    check('keyboard', 'No unexpected focus cycle during the sampled Tab sequence', !unexpectedRepeat);
    check('keyboard', 'First Tab reaches the skip-to-main link', trace[0]?.skip);
    const hasSkip = await evaluate(send, () => {
      const first = window.__edgepressKeyboardAudit.candidates.find(element => element.matches('a[href^="#"]') &&
        document.getElementById(element.getAttribute('href').slice(1))?.matches('main,[role="main"]'));
      first?.focus();
      return Boolean(first && document.activeElement === first);
    });
    if (hasSkip) await key(send, 'Enter');
    const skipReached = hasSkip && await evaluate(send, () => {
      if (!location.hash) return false;
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      return Boolean(target?.matches('main,[role="main"]') && target.getBoundingClientRect().top < innerHeight);
    });
    check('keyboard', 'Enter on the skip link reaches the main landmark', skipReached);
    return { checks, trace, status: checks.every(item => item.passed) ? 'pass' : 'fail' };
  } finally {
    await send('Runtime.evaluate', { expression: '(() => { const manager = document.querySelector("[data-consent-ui]"); if (manager) manager.style.display = ' +
      JSON.stringify(previous.display) + '; history.replaceState(history.state, "", ' + JSON.stringify(previous.href) +
      '); delete window.__edgepressKeyboardAudit; })()' });
  }
}
