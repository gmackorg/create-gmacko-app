# Maestro E2E Tests

Mobile end-to-end tests using [Maestro](https://maestro.mobile.dev/).

## Setup

### Install Maestro

```bash
# macOS
brew install maestro

# Linux/WSL
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Configure Environment

Set the following environment variables:

```bash
export APP_ID="com.gmacko.app"  # Your app's bundle ID
export API_URL="http://localhost:3000"  # Backend API URL
export TEST_EMAIL="test@example.com"  # Test account email
export TEST_PASSWORD="testpassword123"  # Test account password
```

## Running Tests

### Run All Flows

```bash
maestro test .maestro/
```

### Run Single Flow

```bash
maestro test .maestro/flows/01-app-launch.yaml
```

### Run with Custom Config

```bash
maestro test .maestro/ --config .maestro/config.yaml
```

### Run on Specific Device

```bash
# iOS Simulator
maestro test .maestro/ --device "iPhone 15"

# Android Emulator
maestro test .maestro/ --device "Pixel 6"
```

## Available Flows

| Flow                   | Description                         |
| ---------------------- | ----------------------------------- |
| `01-app-launch.yaml`   | Verifies app launches successfully  |
| `02-auth-signin.yaml`  | Tests sign-in flow                  |
| `03-auth-signout.yaml` | Tests sign-out flow                 |
| `04-navigation.yaml`   | Tests tab navigation and deep links |
| `05-posts-crud.yaml`   | Tests creating and deleting posts   |

## Writing New Flows

### Basic Structure

```yaml
appId: ${APP_ID}
---
# Launch app
- launchApp

# Interact with elements
- tapOn:
    text: "Button Text"

# Assert visibility
- assertVisible:
    text: "Expected Text"

# Take screenshot
- takeScreenshot: screenshot-name
```

### Common Commands

```yaml
# Tap by text (with regex)
- tapOn:
    text: "Sign [Ii]n"
    regex: true

# Tap by ID
- tapOn:
    id: "element-id"

# Input text
- inputText: "Hello World"

# Wait for element
- assertVisible:
    text: "Loading"
    timeout: 5000

# Conditional execution
- runFlow:
    when:
      visible:
        text: "Dialog"
    commands:
      - tapOn: "OK"

# Navigate back
- back

# Open deep link
- openLink: gmacko://screen
```

## CI Integration

Add to your EAS build workflow:

```yaml
- name: Run Maestro Tests
  uses: mobile-dev-inc/action-maestro-cloud@v1
  with:
    api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
    app-file: path/to/app.apk # or .app/.ipa
```

Or run locally in CI:

```yaml
- name: Install Maestro
  run: curl -Ls "https://get.maestro.mobile.dev" | bash

- name: Run E2E Tests
  run: |
    export PATH="$PATH:$HOME/.maestro/bin"
    maestro test apps/expo/.maestro/
```

## Debugging

### Record Flow

```bash
maestro record
```

### Interactive Mode

```bash
maestro studio
```

### View Logs

```bash
maestro test --debug .maestro/flows/01-app-launch.yaml
```

## Screenshots

Screenshots are saved to:

- On success: `~/.maestro/screenshots/`
- On failure: `~/.maestro/screenshots/error-<timestamp>.png`

Configure in `config.yaml`:

```yaml
onFlowError:
  - takeScreenshot: error-${timestamp}
```
