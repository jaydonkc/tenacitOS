import { useState, useEffect } from 'react';
import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function useAvatarModel(agentId: string) {
  const [modelExists, setModelExists] = useState<boolean | null>(null);
  const [model, setModel] = useState<Group | null>(null);
  const modelPath = `/models/${agentId}.glb`;

  useEffect(() => {
    let active = true;
    const loader = new GLTFLoader();

    fetch(modelPath, { method: 'HEAD' })
      .then((response) => {
        if (!active) {
          return;
        }

        setModelExists(response.ok);
        if (!response.ok) {
          setModel(null);
          return;
        }

        loader.load(
          modelPath,
          (gltf) => {
            if (active) {
              setModel(gltf.scene);
            }
          },
          undefined,
          () => {
            if (active) {
              setModelExists(false);
              setModel(null);
            }
          }
        );
      })
      .catch(() => {
        if (active) {
          setModelExists(false);
          setModel(null);
        }
      });

    return () => {
      active = false;
    };
  }, [modelPath]);

  return { model, loading: modelExists === null || (modelExists === true && model === null) };
}
