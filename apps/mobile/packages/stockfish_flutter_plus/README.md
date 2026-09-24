### 📦 stockfish_flutter_plus


A modern, improved Stockfish engine plugin for Flutter — with full Android 16-KB page size support
stockfish_flutter_plus is an enhanced and actively maintained fork of the original Stockfish Flutter plugin.
It provides a simple and efficient API for running the Stockfish chess engine inside your Flutter applications using FFI.

This version includes:  
✔ Updated build configuration  
✔ Correct support for Android’s 16 KB memory page size requirement  
✔ Automatic NNUE network downloads  
✔ Cleaned and improved CMake build  
✔ Full compatibility with modern Flutter and Dart SDKs  

### 🚀 Features  
🧠 Run Stockfish directly on-device  
⚡ Fast evaluation and UCI commands via FFI  
📱 Works on Android and iOS  
🔧 ARM64 16 KB page support for Google Play compliance  
🤝 Simple asynchronous API  
🟦 Lightweight, no external dependencies  
🔄 Uses the latest Stockfish NNUE networks


## Example

[@PScottZero](https://github.com/PScottZero) was kind enough to create a [working chess game](https://github.com/PScottZero/EnPassant/tree/stockfish) using this package, and you can also check out another full implementation created by myself [DexterFury](https://github.com/Dexterfury/flutter_chess).

## Usages

iOS project must have `IPHONEOS_DEPLOYMENT_TARGET` >=12.0.

### Add dependency

Update `dependencies` section inside `pubspec.yaml`:

```yaml
  stockfish_flutter_plus: ^1.0.0
```

### Init engine

```dart
import 'package:stockfish_flutter_plus/stockfish_flutter_plus.dart';

// create a new instance
final stockfish = Stockfish();

// state is a ValueListenable<StockfishState>
print(stockfish.state.value); # StockfishState.starting

// the engine takes a few moment to start
await Future.delayed(...)
print(stockfish.state.value); # StockfishState.ready
```

### UCI command

Waits until the state is ready before sending commands.

```dart
stockfish.stdin = 'isready';
stockfish.stdin = 'go movetime 3000';
stockfish.stdin = 'go infinite';
stockfish.stdin = 'stop';
```

Engine output is directed to a `Stream<String>`, add a listener to process results.

```dart
stockfish.stdout.listen((line) {
  // do something useful
  print(line);
});
```

### 🛠 Android: 16 KB Page Size Support (Important)
Google Play requires modern ARM64 apps to support 16 KB memory pages.
This plugin includes updated CMake configurations that compile Stockfish with:

```arduino
-Wl,-z,max-page-size=16384
```

This ensures your app passes all Google Play ABI compliance checks.
No additional configuration is required from your side.

### Dispose / Hot reload

There are two active isolates when Stockfish engine is running. That interferes with Flutter's hot reload feature so you need to dispose it before attempting to reload.

```dart
// sends the UCI quit command
stockfish.stdin = 'quit';

// or even easier...
stockfish.dispose();
```

Note: only one instance can be created at a time. The factory method `Stockfish()` will return `null` if it was called when an existing instance is active.

### 📁 Project Structure

```bash
lib/
  stockfish_flutter_plus.dart

android/
  CMakeLists.txt   # Builds Stockfish + 16 KB page size fix
  src/main/cpp/    # FFI Bridge and Stockfish source

ios/
  Stockfish/       # iOS Stockfish source
```

### 📦 NNUE Network Handling

On Android, NNUE files are automatically downloaded at build time using:

```scss
file(DOWNLOAD ...)
```

These files are placed into the engine’s working directory and loaded automatically.

### 🧩 Platform Support

| Platform | Supported | Notes                                     |
| -------- | --------- | ----------------------------------------- |
| Android  | ✅         | 16 KB page size compliant                 |
| iOS      | ✅         | Fully supported                           |
| Windows  | ❌         | Not included in this version              |
| Linux    | ❌         | Not included                              |
| Web      | ❌         | Not supported (requires native execution) |


### 📝 License & Attribution

This package is a fork and enhancement of the original plugin:
🔗 https://github.com/ArjanAswal/stockfish
The Stockfish engine itself is licensed under the GPLv3, which applies to this package.
You must keep your modifications open-source when redistributing.


### ❤️ Credits

Stockfish engine team: https://stockfishchess.org
Original Flutter plugin by Arjan Aswal
Improvements and 16 KB support: Raphael (Developer of Stockfish Flutter Plus)


### 💬 Support

If you have issues, suggestions, or want to contribute:
GitHub Issues
Pull Requests welcome
Contributions appreciated