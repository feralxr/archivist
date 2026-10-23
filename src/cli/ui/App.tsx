import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { memoryStore } from "../../memory/store.js";
import type { ProjectMemory } from "../../memory/types.js";

export function App() {
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    memoryStore.get(process.cwd()).then((m) => {
      setMemory(m);
      setLoading(false);
    });
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Archivist
        </Text>
        <Text dimColor> — Intelligent code review with project memory</Text>
      </Box>

      {loading ? (
        <Text>Loading memory...</Text>
      ) : !memory ? (
        <Box flexDirection="column">
          <Text color="yellow">No project memory found.</Text>
          <Text dimColor>Run `archivist init` to create one.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text>
            Repository: <Text bold>{memory.repoName}</Text>
          </Text>
          <Text>
            Version: {memory.metadata.version} | PRs analyzed:{" "}
            {memory.metadata.prsAnalyzed}
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text>Style rules: {memory.styleRules.length}</Text>
            <Text>Architecture notes: {memory.architectureNotes.length}</Text>
            <Text>Patterns: {memory.patterns.length}</Text>
            <Text>Historical feedback: {memory.historicalFeedback.length}</Text>
            <Text>Raw snippets: {memory.rawSnippets.length}</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Commands: setup | init | memory | memory:add | review | models | tui
        </Text>
      </Box>
    </Box>
  );
}
