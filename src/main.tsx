import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Workspace } from './content/Workspace';
import type { Manifest } from './engine/types';
import './style.css';
import './content/import.css';

function Bootstrap() {
    const [manifest, setManifest] = useState<Manifest>();
    const [menu, setMenu] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const isDevelopment = new URLSearchParams(location.search).has('dev');
        const path = isDevelopment ? 'game/development.json' : 'game/project.json';

        async function loadProject() {
            const response = await fetch(new URL(path, document.baseURI));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const project: Manifest = await response.json();
            if (!project.development) {
                const menuResponse = await fetch(new URL(`game/${project.scripts[project.entry]}`, document.baseURI));
                if (!menuResponse.ok) throw new Error('Local menu is unavailable');
                setMenu(await menuResponse.text());
            }
            setManifest(project);
        }

        loadProject().catch(cause => setError(String(cause)));
    }, []);

    if (error) return <main><h1>Could not open the project</h1><p>{error}</p></main>;
    if (!manifest) return <main>Loading local project…</main>;
    if (manifest.development) return <App manifest={manifest} />;
    return <Workspace base={manifest} menuSource={menu} />;
}

createRoot(document.getElementById('root')!).render(<Bootstrap />);
