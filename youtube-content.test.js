const {test}=require('node:test'),assert=require('node:assert/strict');
const {config,classify}=require('./youtube-content');
test('YouTube content rules distinguish explicit disclosure from a topic and never assert truth',()=>{
 const c=config({ytContentEnabled:true,ytContentAI:'skip',ytContentVoice:'mark',ytContentClickbait:'mark',ytContentQuality:'off'});
 for(const title of ['Новости AI и нейросетей','How AI works','Создано с помощью камеры','Учёные обнаружили жизнь на Марсе'])assert.deepEqual(classify(title,'',c),[]);
 assert.equal(classify('Created: AI-generated film','',c)[0].mode,'skip');assert.equal(classify('Создано с помощью нейросети','',c)[0].key,'AI');
 assert.equal(classify('Озвучено нейросетью','',c)[0].mode,'mark');assert.equal(classify('Вы не поверите: эксперимент','',c)[0].key,'Clickbait');
 assert.deepEqual(classify('AI-generated film','',config()),[]);
});
test('personal rules are bounded literal phrases and exact channel names',()=>{
 const c=config({ytContentEnabled:true,ytContentWords:'a+b\nspoiler',ytContentChannels:'Some Channel'});
 assert.equal(classify('A+B video','',c)[0].key,'Words');assert.equal(classify('Hello','some channel',c)[0].key,'Channels');assert.deepEqual(classify('Hello','some channel extra',c),[]);
 assert.equal(config({ytContentWords:'x'.repeat(5000)}).Words[0].length,4000);
});
test('AI topic tutorials and explicit denials never trigger automatic AI hiding',()=>{
 const c=config({ytContentEnabled:true,ytContentAI:'skip',ytContentVoice:'skip'});
 for(const title of ['How to spot AI-generated videos','AI-generated videos explained','AI voice tutorial','Как распознать сгенерированное ИИ видео','Разбор: озвучено нейросетью','Not AI-generated: real camera footage','Не сгенерировано ИИ','Без ИИ: озвучено нейросетью?'])assert.deepEqual(classify(title,'',c),[],title);
 assert.equal(classify('AI-generated short film','',c)[0].mode,'skip');
});
