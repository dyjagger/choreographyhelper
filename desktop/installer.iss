#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

[Setup]
AppId={{A7E8901E-27C7-4C70-B10B-E22BF26DBD4D}
AppName=Formation Studio
AppVersion={#MyAppVersion}
AppPublisher=Formation Studio
DefaultDirName={localappdata}\Programs\Formation Studio
DefaultGroupName=Formation Studio
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\out\installer
OutputBaseFilename=Formation-Studio-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Formation Studio.exe
ChangesAssociations=yes

[Files]
Source: "..\out\Formation Studio-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Formation Studio"; Filename: "{app}\Formation Studio.exe"
Name: "{autodesktop}\Formation Studio"; Filename: "{app}\Formation Studio.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Registry]
Root: HKCU; Subkey: "Software\Classes\.formation"; ValueType: string; ValueData: "FormationStudio.Project"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\FormationStudio.Project"; ValueType: string; ValueData: "Formation Studio Project"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\FormationStudio.Project\DefaultIcon"; ValueType: string; ValueData: "{app}\Formation Studio.exe,0"
Root: HKCU; Subkey: "Software\Classes\FormationStudio.Project\shell\open\command"; ValueType: string; ValueData: """{app}\Formation Studio.exe"" ""%1"""

[Run]
Filename: "{app}\Formation Studio.exe"; Description: "Launch Formation Studio"; Flags: nowait postinstall skipifsilent
