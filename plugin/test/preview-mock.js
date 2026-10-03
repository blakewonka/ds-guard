// Stands in for the plugin's main thread so dist/preview.html can run in a plain browser.
(() => {
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'figma-dark' : 'figma-light';
  document.body.classList.add(theme);

  let libraries = [
    { libraryId: 'core', name: 'BirDS Core', version: 14, indexedAt: '2026-10-01T09:00:00Z', use: 'approved', componentCount: 412 },
    { libraryId: 'brand-a', name: 'BirDS Brand A', version: 9, indexedAt: '2026-10-01T09:05:00Z', use: 'approved', componentCount: 96 },
    { libraryId: 'brand-b', name: 'BirDS Brand B', version: 7, indexedAt: '2026-09-20T09:00:00Z', use: 'other-brand', componentCount: 88 },
  ];
  let available = [
    { libraryId: 'core', name: 'BirDS Core', componentCount: 412 },
    { libraryId: 'brand-a', name: 'BirDS Brand A', componentCount: 96 },
    { libraryId: 'brand-b', name: 'BirDS Brand B', componentCount: 88 },
    { libraryId: 'icons', name: 'BirDS Icons', componentCount: 640 },
    { libraryId: 'legacy', name: 'BirDS Legacy', componentCount: 230 },
  ];
  const empty = location.search.includes('empty');
  if (empty) libraries = [];
  if (empty) available = [];
  const all = available.length > 0 ? available : [{ libraryId: 'core', name: 'BirDS Core', componentCount: 412 }];
  const state = () => ({ hasToken: !empty || available.length > 0, available, libraries });

  const finding = (nodeId, screenId, state, componentName, sourceLibrary) => ({
    nodeId, pageId: 'p', screenId, state, componentName, sourceLibrary, confidence: 'certain', fixes: [],
  });
  const result = {
    scope: 'page',
    pageName: 'Onboarding',
    scanned: 1840,
    threshold: 1,
    screens: { s1: 'Welcome', s2: 'Enter phone number', s3: 'Verify code' },
    findings: [
      ...Array.from({ length: 21 }, (_, i) => finding(`a${i}`, i % 3 === 0 ? 's1' : i % 3 === 1 ? 's2' : 's3', 'approved', 'Button', 'BirDS Core')),
      finding('w1', 's2', 'wrong-brand', 'Card', 'BirDS Brand B'),
      finding('w2', 's2', 'wrong-brand', 'Banner', 'BirDS Brand B'),
      finding('u1', 's2', 'unknown-library', 'Phone input'),
      finding('l1', 's3', 'local', 'OTP field copy'),
      finding('d1', 's2', 'detached', 'Button', 'BirDS Core'),
      finding('x1', 's1', 'exception', 'Device frame'),
    ],
    summary: {
      pass: false, passRate: 1 / 3, coverage: 21 / 26,
      screens: [
        { screenId: 's2', approved: 7, violations: 4, exceptions: 0, suspected: 0, coverage: 7 / 11, pass: false },
        { screenId: 's3', approved: 7, violations: 1, exceptions: 0, suspected: 0, coverage: 7 / 8, pass: false },
        { screenId: 's1', approved: 7, violations: 0, exceptions: 1, suspected: 0, coverage: 1, pass: true },
      ],
    },
  };

  const reply = (msg, delay = 0) => setTimeout(() => window.postMessage({ pluginMessage: msg }, '*'), delay);
  window.addEventListener('message', (event) => {
    const msg = event.data && event.data.pluginMessage;
    if (!msg) return;
    switch (msg.type) {
      case 'ui-ready':
        reply({ type: 'init', tab: location.search.includes('libraries') ? 'Libraries' : 'Check', teamLink: empty ? '' : 'https://www.figma.com/files/team/123456', ...state() });
        break;
      case 'scan':
        reply({ type: 'scan-result', result }, 400);
        break;
      case 'set-library-use':
        libraries = libraries.map((l) => (l.libraryId === msg.libraryId ? { ...l, use: msg.use } : l));
        reply({ type: 'libraries', ...state() });
        break;
      case 'remove-library':
        libraries = libraries.filter((l) => l.libraryId !== msg.libraryId);
        reply({ type: 'libraries', ...state() });
        break;
      case 'load-team':
        available = all;
        reply({ type: 'libraries', ...state() }, 600);
        break;
      case 'add-library': {
        const added = available.find((a) => a.libraryId === msg.libraryId);
        libraries = [...libraries, { ...added, version: 1, indexedAt: new Date().toISOString(), use: 'approved' }];
        reply({ type: 'libraries', ...state() }, 300);
        break;
      }
    }
  });
})();
