import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { memoryStore } from "../../memory/store.js";
import type { ProjectMemory } from "../../memory/types.js";
import { hasOpenRouter, hasGitHubApp, env } from "../../core/config.js";
import { resolveLocalRepoIdentity } from "../../memory/identity.js";

type Tab = "overview" | "style" | "architecture" | "patterns" | "feedback";

export function App() {
  const { exit } = useApp();
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const identity = resolveLocalRepoIdentity();

  useEffect(() => {
    memoryStore.get(identity.repoId).then((m) => {
      setMemory(m);
      setLoading(false);
    });
  }, [identity.repoId]);

  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
    if (input === "1") setTab("overview");
    if (input === "2") setTab("style");
    if (input === "3") setTab("architecture");
    if (input === "4") setTab("patterns");
    if (input === "5") setTab("feedback");
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Archivist
        </Text>
        <Text dimColor>  project memory</Text>
      </Box>

      <Box marginBottom={1}>
        <TabLabel id="1" label="Overview" active={tab === "overview"} />
        <Text> </Text>
        <TabLabel id="2" label="Style" active={tab === "style"} />
        <Text> </Text>
        <TabLabel id="3" label="Arch" active={tab === "architecture"} />
        <Text> </Text>
        <TabLabel id="4" label="Patterns" active={tab === "patterns"} />
        <Text> </Text>
        <TabLabel id="5" label="Feedback" active={tab === "feedback"} />
      </Box>

      {loading ? (
        <Text>Loading...</Text>
      ) : !memory ? (
        <Box flexDirection="column">
          <Text color="yellow">No memory for {identity.repoName}.</Text>
          <Text dimColor>Run archivist init</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {tab === "overview" && <Overview memory={memory} />}
          {tab === "style" && (
            <List title="Style Rules" items={memory.styleRules.map((r) => r.rule)} />
          )}
          {tab === "architecture" && (
            <List
              title="Architecture"
              items={memory.architectureNotes.map((n) => n.note)}
            />
          )}
          {tab === "patterns" && (
            <List
              title="Patterns"
              items={memory.patterns.map(
                (p) =>
                  `[${p.preferred ? "preferred" : "discouraged"}] ${p.description}`
              )}
            />
          )}
          {tab === "feedback" && (
            <List
              title="Recurring Feedback"
              items={memory.historicalFeedback
                .sort((a, b) => b.frequency - a.frequency)
                .map((f) => `(${f.frequency}×) ${f.summary}`)}
            />
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          [1-5] tabs [q] quit · OR:{hasOpenRouter() ? "✓" : "✗"} App:
          {hasGitHubApp() ? "✓" : "✗"} · {env.ARCHIVIST_MODEL}
        </Text>
      </Box>
    </Box>
  );
}

function TabLabel({
  id,
  label,
  active,
}: {
  id: string;
  label: string;
  active: boolean;
}) {
  return (
    <Text color={active ? "cyan" : undefined} bold={active} inverse={active}>
      {id}:{label}
    </Text>
  );
}

function Overview({ memory }: { memory: ProjectMemory }) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{memory.repoName}</Text>
        {memory.remoteUrl ? <Text dimColor> · {memory.remoteUrl}</Text> : null}
      </Text>
      <Text>
        v{memory.metadata.version} · {memory.metadata.prsAnalyzed} PRs
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Style rules          {memory.styleRules.length}</Text>
        <Text>Architecture notes   {memory.architectureNotes.length}</Text>
        <Text>Patterns             {memory.patterns.length}</Text>
        <Text>Historical feedback  {memory.historicalFeedback.length}</Text>
        <Text>Raw snippets         {memory.rawSnippets.length}</Text>
      </Box>
    </Box>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return <Text dimColor>No {title.toLowerCase()} yet.</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {items.slice(0, 15).map((item, i) => (
        <Text key={i}>
          • {item.length > 100 ? item.slice(0, 100) + "…" : item}
        </Text>
      ))}
      {items.length > 15 && (
        <Text dimColor>…and {items.length - 15} more</Text>
      )}
    </Box>
  );
}
