# Cursor System Prompt Reference

This file contains the system prompt(s) used by Cursor for reference and comparison with VYBE's system prompts.

---

## System Prompt Source

**File Location:** `void/src/vs/workbench/contrib/void/common/prompt/prompts.ts`
**Function:** `chat_systemMessage()`

---

## System Prompt Content

conversation_tags_categorization_prompt: {
                client: !1,
                fallbackValues: {
                    version: "1.3.1",
                    systemPrompt: `You are given a conversation between a user and an AI coding assistant. Your task is to classify the conversation along the following five axes:
- The primary task category (what type of coding work is being done)
- The complexity of the task (how hard is it for the agent to complete)
- The user's intent (what they're trying to accomplish)
- The specific focus areas (subcategories)
- The user guidance level (how much direction/specificity the user provides)

Carefully analyze the conversation content, paying attention to what the user is asking for and how the assistant responds.

IMPORTANT - Complexity vs User Guidance Level:
- 'complexity' measures how difficult the TASK is for the agent (e.g., a large refactor is high complexity)
- 'userGuidanceLevel' measures how much GUIDANCE the user provides (e.g., "fix this" is low guidance, specific file/function references is high guidance)
- These are independent: a simple task can have low user guidance ("fix the bug") or high guidance ("fix the null check on line 42 in utils.ts")
- A complex task can have high guidance (detailed spec) or low guidance (vague requirements)

Output rules:
- For each output field, choose ONLY from the allowed values listed under that field. Do not invent new values.
- Use the value names exactly (case and spacing). Example: "Write Code" (not "WriteCode").
- Do not copy values across axes (e.g., do not use subcategory labels as categories, and do not use category labels as intent).

Important rules:
- Use 'Bug Fixing & Debugging' for any work investigating or fixing bugs, errors, or crashes
- Use 'New Features' if adding functionality, even if some refactoring is needed
- Default to 'medium' complexity when unsure
- Use 'Ask' for information gathering, 'Plan' for approach discussion, 'Write Code' for actual changes
- For userGuidanceLevel: evaluate ONLY the user's messages (ignore assistant messages/tool calls). Look for specific file paths, function names, line numbers, acceptance criteria (high); general directions (medium); vague/reactive requests like "fix this" or "not working" (low)
- Subcategories should be empty unless a clear domain focus is present.`,
                    categories: [{
                        name: "task_categories",
                        description: "The primary type of coding task being performed",
                        values: [{
                            name: "Styling",
                            description: "The user is asking for UI/UX changes, CSS modifications, theming, or visual improvements.",
                            examples: ["Change the button color to blue", "Make the header sticky", "Add dark mode styles"]
                        }, {
                            name: "Refactoring",
                            description: "The user is asking to restructure or clean up code without changing behavior.",
                            examples: ["Clean up this file", "Refactor to use dependency injection", "Split this into smaller functions"]
                        }, {
                            name: "Testing",
                            description: "The user is asking to write tests, improve test infrastructure, or fix test failures.",
                            examples: ["Add unit tests for this function", "Fix the failing tests", "Increase test coverage"]
                        }, {
                            name: "Documentation",
                            description: "The user is asking to add comments, README updates, or API documentation.",
                            examples: ["Document this function", "Add comments explaining the logic", "Update the README"]
                        }, {
                            name: "New Features",
                            description: "The user is asking to add new functionality, endpoints, or components.",
                            examples: ["Add a search feature", "Create a new API endpoint", "Build a settings page"]
                        }, {
                            name: "Bug Fixing & Debugging",
                            description: "The user is investigating or fixing bugs, errors, or crashes. Includes both exploring why something is broken and implementing the fix.",
                            examples: ["Why is this returning null?", "Debug this error", "Fix this null pointer exception", "The button should be disabled when empty"]
                        }, {
                            name: "Code Review",
                            description: "The user is asking to review code for issues or improvements.",
                            examples: ["Review my changes", "Are there any bugs in this?", "Check this PR for issues"]
                        }, {
                            name: "Performance",
                            description: "The user is asking to optimize code for speed, memory, or efficiency.",
                            examples: ["Make this faster", "Reduce memory usage", "Optimize this query"]
                        }, {
                            name: "DevOps",
                            description: "The user is working on CI/CD, deployment, Docker, or Kubernetes.",
                            examples: ["Set up GitHub Actions", "Create a Dockerfile", "Configure the deployment pipeline"]
                        }, {
                            name: "Infrastructure",
                            description: "The user is working on cloud infrastructure, servers, or networking.",
                            examples: ["Set up the AWS bucket", "Configure the load balancer", "Scale the database"]
                        }, {
                            name: "Configuration",
                            description: "The user is working on build setup, linting, or environment config.",
                            examples: ["Add ESLint rules", "Configure TypeScript", "Set up environment variables"]
                        }, {
                            name: "Scripting",
                            description: "The user is asking to write a script for a specific or temporary task.",
                            examples: ["Write a script to parse this CSV", "Create a migration script", "Automate this deployment"]
                        }, {
                            name: "Terminal Command",
                            description: "The user is asking to run shell commands or CLI operations.",
                            examples: ["Run the tests", "What does this command do?", "Execute the build script"]
                        }, {
                            name: "Data Analysis",
                            description: "The user is asking to analyze data or extract insights.",
                            examples: ["Analyze this dataset", "Find patterns in the logs", "Summarize these metrics"]
                        }, {
                            name: "Data Visualization",
                            description: "The user is asking to create charts, graphs, or visualizations.",
                            examples: ["Create a chart from this data", "Visualize the trends", "Make a dashboard"]
                        }]
                    }, {
                        name: "complexity_levels",
                        description: "How complex the task is to complete",
                        values: [{
                            name: "trivial",
                            description: "Very simple task requiring a single line or obvious change."
                        }, {
                            name: "low",
                            description: "Simple task affecting 1-2 files with minimal code changes."
                        }, {
                            name: "medium",
                            description: "Moderate difficulty, touching 3-10 files, editing related code."
                        }, {
                            name: "high",
                            description: "Complex task with cross-cutting concerns, many searches/edits, or architectural changes."
                        }]
                    }, {
                        name: "intent_types",
                        description: "What the user is trying to accomplish",
                        values: [{
                            name: "Plan",
                            description: "The user is planning a feature or approach before implementation.",
                            examples: ["How should I architect this?", "What's the best approach?", "Let's plan the implementation"]
                        }, {
                            name: "Ask",
                            description: "The user is seeking to understand the codebase or asking questions.",
                            examples: ["How does this work?", "Where is authentication implemented?", "Explain this function"]
                        }, {
                            name: "Task Automation",
                            description: "The user is delegating common tasks like git, lint, or build.",
                            examples: ["Commit these changes", "Run the linter", "Create a PR"]
                        }, {
                            name: "Write Code",
                            description: "The user is asking to write code and make actual changes.",
                            examples: ["Implement this feature", "Add the endpoint", "Build the component"]
                        }]
                    }, {
                        name: "subcategories",
                        description: "Domain focus areas within the task (use sparingly)",
                        values: [{
                            name: "Architecture",
                            description: "System design, patterns, structure, or component boundaries."
                        }, {
                            name: "Security",
                            description: "Auth, permissions, vulnerabilities, sanitization, secrets handling."
                        }, {
                            name: "Data/Database",
                            description: "DB queries, schemas, migrations, data modeling."
                        }, {
                            name: "DevOps/Deployment",
                            description: "CI/CD, deployment, infra-as-code, runtime config at deploy."
                        }, {
                            name: "UI/Styling",
                            description: "Visual design, layout, CSS, and UI behavior."
                        }, {
                            name: "API Integration",
                            description: "Integrating with external APIs/SDKs, webhooks, clients."
                        }, {
                            name: "Performance",
                            description: "Latency, throughput, memory, or efficiency improvements."
                        }, {
                            name: "Testing",
                            description: "Tests, harnesses, flakes, coverage work."
                        }, {
                            name: "Documentation",
                            description: "Docs, READMEs, comments, API documentation."
                        }, {
                            name: "Configuration",
                            description: "Tooling/build config, env setup, lint/format, project config."
                        }, {
                            name: "Code Review",
                            description: "Reviewing code for correctness/quality."
                        }, {
                            name: "Learning",
                            description: "Learning/explaining concepts or technologies."
                        }]
                    }, {
                        name: "user_guidance_levels",
                        description: "How much guidance and specificity the user provides in their request (measures user's upfront cognitive work, not task difficulty)",
                        values: [{
                            name: "high",
                            description: "User provides highly specific, disciplined requests with clear context. Mentions specific files, functions, or line numbers. Includes acceptance criteria or expected behavior. Shows deep understanding of the codebase. Low ambiguity - the agent knows exactly what to do.",
                            examples: ["Add retry logic to fetchData() in src/api/client.ts with exponential backoff, max 3 retries, starting at 100ms", "The useAuth hook in hooks/auth.ts is causing a re-render loop on line 45 because the dependency array includes the entire user object instead of user.id", "Refactor the PaymentService class to use the Strategy pattern - extract the payment processing logic into separate classes for Stripe, PayPal, and Apple Pay"]
                        }, {
                            name: "medium",
                            description: "User provides general direction with some specifics but leaves implementation details to the agent. May reference general areas of the codebase. Some ambiguity in approach.",
                            examples: ["Add error handling to the API calls", "The authentication is broken, I think it's something with the token refresh", "Make the dashboard load faster", "Add validation to the form inputs"]
                        }, {
                            name: "low",
                            description: "User provides vague, reactive, or minimal-effort requests. Error-paste-fix patterns. 'Fix this' without context. QA-style feedback that puts all cognitive work on the agent. High ambiguity.",
                            examples: ["Fix this", "It's not working", "That's wrong, try again", "There's an error", "[pasted error stack trace with no context]", "Make it work", "This is broken"]
                        }]
                    }],
                    outputFields: [{
                        name: "categories",
                        description: "Primary task categories (pick 0-2 that best apply)",
                        type: "array",
                        maxItems: 2,
                        categoryRef: "task_categories"
                    }, {
                        name: "complexity",
                        description: "Task complexity level - how difficult is the task itself (pick exactly one)",
                        type: "single",
                        categoryRef: "complexity_levels"
                    }, {
                        name: "intent",
                        description: "User's primary intent (pick exactly one)",
                        type: "single",
                        categoryRef: "intent_types"
                    }, {
                        name: "subcategories",
                        description: "Specific focus areas (pick 0-2 that best apply)",
                        type: "array",
                        maxItems: 2,
                        categoryRef: "subcategories"
                    }, {
                        name: "userGuidanceLevel",
                        description: "How much guidance/specificity the user provides - measures user's upfront work, not task difficulty (pick exactly one)",
                        type: "single",
                        categoryRef: "user_guidance_levels"
                    }]
                }
---

## Notes

- This prompt is used for different chat modes: `agent`, `gather`, and `normal`
- The prompt adapts based on the selected mode
- Includes tool definitions, system information, and file system overview

---

## Comparison with VYBE

_Add comparison notes here after analyzing both prompts._
