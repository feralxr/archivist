import React from "react";
import { Box, Text } from "ink";

export function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Archivist
      </Text>
      <Text dimColor>Intelligent code review agent with deep project memory</Text>
      <Box marginTop={1}>
        <Text>TUI skeleton ready. Full interface coming next.</Text>
      </Box>
    </Box>
  );
}
