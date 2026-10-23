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
Compression=lzma2
SolidCompression=yes
WizardStyle=modern dark includetitlebar hidebevels
WizardSizePercent=135
WizardBackColor=#151b16
WizardBackImageFile=..\assets\mont-saint-michel.png
WizardBackImageOpacity=85
WizardImageFile=
WizardSmallImageFile=
DefaultDialogFontName=Segoe UI
DisableWelcomePage=no
DisableDirPage=no
DisableReadyPage=yes
UninstallDisplayName=Nocturne
UninstallDisplayIcon={app}\Nocturne.exe
CloseApplications=no
RestartApplications=no
ChangesAssociations=no
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
Name: "{group}\Nocturne"; Filename: "{app}\Nocturne.exe"
Name: "{autodesktop}\Nocturne"; Filename: "{app}\Nocturne.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Nocturne.exe"; Description: "{cm:LaunchBrowser}"; Flags: nowait postinstall skipifsilent

; User profiles are deliberately outside {app}; uninstall never removes them.

[CustomMessages]
russian.DesktopShortcut=Создать ярлык на рабочем столе
russian.ShortcutGroup=Ярлыки:
russian.LaunchBrowser=Открыть Nocturne
english.DesktopShortcut=Create a desktop shortcut
english.ShortcutGroup=Shortcuts:
english.LaunchBrowser=Open Nocturne

[Messages]
russian.WelcomeLabel1=Добро пожаловать%nв Nocturne
russian.WelcomeLabel2=Тихое место для твоего интернета.%n%nУстановим браузер и подготовим всё к первому запуску.%nТему, поиск и перенос данных можно настроить внутри.
russian.FinishedHeadingLabel=Nocturne готов.
russian.FinishedLabel=Браузер установлен.%n%nВыбери свою тему, настрой поиск и перенеси нужное из других браузеров при первом запуске.
russian.SelectDirLabel3=Где поселится Nocturne?
russian.SelectDirDesc=Выбери папку для браузера.
russian.SelectTasksDesc=Последние штрихи.
russian.SelectTasksLabel2=Как тебе будет удобнее открывать браузер?
russian.InstallingLabel=Подготавливаем Nocturne. Осталось совсем немного.
english.WelcomeLabel1=Welcome to Nocturne
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
  SignatureLabel: TNewStaticText;

procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel1.Font.Name := 'Georgia';
  WizardForm.WelcomeLabel1.Font.Size := 30;
  WizardForm.WelcomeLabel1.Font.Style := [];
  WizardForm.WelcomeLabel1.SetBounds(ScaleX(28), ScaleY(36),
    WizardForm.WelcomePage.Width - ScaleX(56), ScaleY(100));
  WizardForm.WelcomeLabel2.SetBounds(ScaleX(30), ScaleY(155),
    WizardForm.WelcomePage.Width - ScaleX(60), ScaleY(140));
  WizardForm.WelcomeLabel2.Font.Size := 11;
  WizardForm.FinishedHeadingLabel.Font.Name := 'Georgia';
  WizardForm.FinishedHeadingLabel.Font.Size := 28;
  WizardForm.FinishedHeadingLabel.Font.Style := [];
  WizardForm.FinishedHeadingLabel.SetBounds(ScaleX(28), ScaleY(36),
    WizardForm.FinishedPage.Width - ScaleX(56), ScaleY(70));
  WizardForm.FinishedLabel.SetBounds(ScaleX(30), ScaleY(132),
    WizardForm.FinishedPage.Width - ScaleX(60), ScaleY(110));
  WizardForm.FinishedLabel.Font.Size := 11;
  WizardForm.RunList.Left := ScaleX(30);
  WizardForm.RunList.Top := ScaleY(265);
  WizardForm.RunList.Width := WizardForm.FinishedPage.Width - ScaleX(60);
  WizardForm.PageNameLabel.Font.Name := 'Georgia';
  WizardForm.PageNameLabel.Font.Size := 14;
  WizardForm.PageNameLabel.Font.Style := [];
  WizardForm.PageNameLabel.Height := ScaleY(25);
  WizardForm.PageDescriptionLabel.Top := WizardForm.PageNameLabel.Top + ScaleY(27);
  SignatureLabel := TNewStaticText.Create(WizardForm);
  SignatureLabel.Parent := WizardForm;
  SignatureLabel.Caption := 'N O C T U R N E   /   {#AppVersion}';
  SignatureLabel.Font.Size := 8;
  SignatureLabel.SetBounds(ScaleX(20), WizardForm.NextButton.Top + ScaleY(7),
    ScaleX(230), ScaleY(20));
end;
