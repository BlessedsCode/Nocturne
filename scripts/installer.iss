#define AppVersion GetEnv('NOCTURNE_APP_VERSION')
#define BuildDirectory GetEnv('NOCTURNE_BUILD_DIRECTORY')
#define OutputDirectory GetEnv('NOCTURNE_INSTALLER_OUTPUT')

[Setup]
AppId=NocturneBrowser
AppName=Nocturne
AppVersion={#AppVersion}
AppPublisher=Nocturne
DefaultDirName={localappdata}\Programs\Nocturne
DefaultGroupName=Nocturne
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir={#OutputDirectory}
OutputBaseFilename=Nocturne-Setup-{#AppVersion}-x64
SetupIconFile=..\assets\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern dark includetitlebar hidebevels
WizardSizePercent=128
WizardBackColor=#141C18
WizardImageFile=..\assets\installer-panel.png
WizardImageStretch=yes
WizardSmallImageFile=..\assets\icon.png
DefaultDialogFontName=Segoe UI
DisableWelcomePage=no
DisableDirPage=no
DisableReadyPage=no
UninstallDisplayName=Nocturne
UninstallDisplayIcon={app}\Nocturne.exe
CloseApplications=no
RestartApplications=no
ChangesAssociations=yes
ChangesEnvironment=no
SetupLogging=yes

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; GroupDescription: "{cm:ShortcutGroup}"; Flags: unchecked

[Files]
Source: "{#BuildDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Nocturne"; Filename: "{app}\Nocturne.exe"; AppUserModelID: "dev.nocturne.browser"
Name: "{autodesktop}\Nocturne"; Filename: "{app}\Nocturne.exe"; Tasks: desktopicon; AppUserModelID: "dev.nocturne.browser"

[Registry]
; Register as an available browser for this user. Windows owns the actual default choice.
Root: HKCU; Subkey: "Software\RegisteredApplications"; ValueType: string; ValueName: "Nocturne"; ValueData: "Software\Clients\StartMenuInternet\Nocturne\Capabilities"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne"; ValueType: string; ValueData: "Nocturne"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne\DefaultIcon"; ValueType: string; ValueData: """{app}\Nocturne.exe"",0"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne\shell\open\command"; ValueType: string; ValueData: """{app}\Nocturne.exe"""
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne\Capabilities"; ValueType: string; ValueName: "ApplicationName"; ValueData: "Nocturne"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne\Capabilities"; ValueType: string; ValueName: "ApplicationDescription"; ValueData: "Nocturne — веб-браузер с защитой и отдельными профилями"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne\Capabilities"; ValueType: string; ValueName: "ApplicationIcon"; ValueData: """{app}\Nocturne.exe"",0"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne\Capabilities\URLAssociations"; ValueType: string; ValueName: "http"; ValueData: "NocturneURL"
Root: HKCU; Subkey: "Software\Clients\StartMenuInternet\Nocturne\Capabilities\URLAssociations"; ValueType: string; ValueName: "https"; ValueData: "NocturneURL"
Root: HKCU; Subkey: "Software\Classes\NocturneURL"; ValueType: string; ValueData: "Nocturne URL"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\NocturneURL"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\NocturneURL\DefaultIcon"; ValueType: string; ValueData: """{app}\Nocturne.exe"",0"
Root: HKCU; Subkey: "Software\Classes\NocturneURL\shell\open\command"; ValueType: string; ValueData: """{app}\Nocturne.exe"" -- ""%1"""

[Run]
Filename: "{app}\Nocturne.exe"; Description: "{cm:LaunchBrowser}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\Nocturne.exe"; Parameters: "--default-browser-settings"; Description: "{cm:ChooseDefaultBrowser}"; Flags: nowait postinstall unchecked skipifsilent

; User profiles are deliberately outside {app}; uninstall never removes them.

[CustomMessages]
russian.SetupKicker=УСТАНОВКА  /  WINDOWS X64
russian.FinishKicker=УСТАНОВКА ЗАВЕРШЕНА
english.SetupKicker=SETUP  /  WINDOWS X64
english.FinishKicker=SETUP COMPLETE
russian.DesktopShortcut=Создать ярлык на рабочем столе
russian.ShortcutGroup=Ярлыки:
russian.LaunchBrowser=Открыть Nocturne
russian.ChooseDefaultBrowser=Настроить браузер по умолчанию
english.DesktopShortcut=Create a desktop shortcut
english.ShortcutGroup=Shortcuts:
english.LaunchBrowser=Open Nocturne
english.ChooseDefaultBrowser=Set up the default browser

[Messages]
russian.WelcomeLabel1=Добро пожаловать в Nocturne
russian.WelcomeLabel2=Тихое место для твоего интернета.%n%nУстановим браузер и подготовим всё к первому запуску.%nТему, поиск и перенос данных можно настроить внутри.
russian.FinishedHeadingLabel=Nocturne готов.
russian.FinishedLabel=Браузер установлен.%n%nВыбери свою тему, настрой поиск и перенеси нужное из других браузеров при первом запуске.
russian.SelectDirLabel3=Где поселится Nocturne?
russian.SelectDirDesc=Выбери папку для браузера.
russian.SelectTasksDesc=Последние штрихи.
russian.SelectTasksLabel2=Как тебе будет удобнее открывать браузер?
russian.ReadyLabel1=Всё готово к установке Nocturne.
english.ReadyLabel1=Nocturne is ready to install.
russian.InstallingLabel=Подготавливаем Nocturne. Осталось совсем немного.
english.WelcomeLabel1=Welcome to%nNocturne
english.WelcomeLabel2=A quiet place for your internet.%n%nLet's install your browser and get it ready.%nChoose your theme, search engine and data import on first launch.
english.FinishedHeadingLabel=Nocturne is ready.
english.FinishedLabel=Your browser is installed.%n%nChoose your theme, set up search and bring your data from other browsers on first launch.
english.SelectDirLabel3=Where will Nocturne live?
english.SelectDirDesc=Choose a home for your browser.
english.SelectTasksDesc=The finishing touches.
english.SelectTasksLabel2=How would you like to open your browser?
english.InstallingLabel=Preparing Nocturne. Just a moment.

[Code]
var
  SignatureLabel, WelcomeKicker, FinishKicker: TNewStaticText;
  ContentLeft, ContentWidth: Integer;

function MakeKicker(Page: TWinControl; Top: Integer; Caption: String): TNewStaticText;
begin
  Result := TNewStaticText.Create(WizardForm);
  Result.Parent := Page;
  Result.Caption := Caption;
  Result.Font.Name := 'Segoe UI Semibold';
  Result.Font.Size := 9;
  Result.Font.Color := $00A7DBC1;
  Result.SetBounds(ContentLeft, ScaleY(Top), ContentWidth, ScaleY(18));
end;

procedure InitializeWizard;
begin
  ContentLeft := WizardForm.WizardBitmapImage.Left + WizardForm.WizardBitmapImage.Width + ScaleX(24);
  ContentWidth := WizardForm.WelcomePage.Width - ContentLeft - ScaleX(24);
  WelcomeKicker := MakeKicker(WizardForm.WelcomePage, 28, CustomMessage('SetupKicker'));
  FinishKicker := MakeKicker(WizardForm.FinishedPage, 28, CustomMessage('FinishKicker'));
  WizardForm.WelcomeLabel1.Font.Name := 'Georgia';
  WizardForm.WelcomeLabel1.Font.Size := 27;
  WizardForm.WelcomeLabel1.Font.Style := [];
  WizardForm.WelcomeLabel1.SetBounds(ContentLeft, ScaleY(58), ContentWidth, ScaleY(105));
  WizardForm.WelcomeLabel2.SetBounds(ContentLeft, ScaleY(174), ContentWidth, ScaleY(140));
  WizardForm.WelcomeLabel2.Font.Size := 11;
  WizardForm.FinishedHeadingLabel.Font.Name := 'Georgia';
  WizardForm.FinishedHeadingLabel.Font.Size := 27;
  WizardForm.FinishedHeadingLabel.Font.Style := [];
  WizardForm.FinishedHeadingLabel.SetBounds(ContentLeft, ScaleY(58), ContentWidth, ScaleY(100));
  WizardForm.FinishedLabel.SetBounds(ContentLeft, ScaleY(144), ContentWidth, ScaleY(105));
  WizardForm.FinishedLabel.Font.Size := 11;
  WizardForm.RunList.Left := ContentLeft;
  WizardForm.RunList.Top := ScaleY(265);
  WizardForm.RunList.Width := ContentWidth;
  WizardForm.RunList.Height := ScaleY(65);
  WizardForm.PageNameLabel.Font.Name := 'Georgia';
  WizardForm.PageNameLabel.Font.Size := 14;
  WizardForm.PageNameLabel.Font.Style := [];
  WizardForm.PageNameLabel.Height := ScaleY(25);
  WizardForm.PageDescriptionLabel.Top := WizardForm.PageNameLabel.Top + ScaleY(27);
  SignatureLabel := TNewStaticText.Create(WizardForm);
  SignatureLabel.Parent := WizardForm;
  SignatureLabel.Caption := 'N O C T U R N E   /   {#AppVersion}';
  SignatureLabel.Font.Name := 'Segoe UI';
  SignatureLabel.Font.Size := 9;
  SignatureLabel.SetBounds(ScaleX(20), WizardForm.NextButton.Top + ScaleY(7),
    ScaleX(230), ScaleY(20));
end;
