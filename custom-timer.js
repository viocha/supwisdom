async function scheduleTimer({
                               providerRes,
                             } = {}) {
  let Util = getUtil();
  await Util.loadJQuery();

  // 判断东北大学校区
  let isHunnan = (providerRes.match(/浑南/g)?.length || 0) >
      (providerRes.match(/南湖/g)?.length || 0);

  // 根据教务首页的信息获取当前周数，计算开学时间
  let week = await fetch('homeExt.action').
      then(r => r.text()).
      then(t => parseInt($('#teach-week font',
          Util.parseHTML(t)).text()));
  let startSemester;
  if (week) {   //周数为非零整数
    let date = new Date();
    date.setDate(date.getDate() - (week - 1) * 7 - date.getDay());
    startSemester = date.getTime();
  }

  // 根据校区生成作息时间
  let sections;
  if (isHunnan)
    sections = generateSectionSchedule({morningStart: [8, 30]});
  else
    sections = generateSectionSchedule();

  return {
    totalWeek: 25,
    startWithSunday: true,
    showWeekend: true,
    forenoon: 4,
    afternoon: 4,
    night: 4,
    startSemester,
    sections,
  };

  //生成课程时间安排
  function generateSectionSchedule({
                                     morningCount = 4,  // 上午节数
                                     afternoonCount = 4, // 下午节数
                                     eveningCount = 4, // 晚上节数
                                     morningStart = [8, 0], // 上午开始时间
                                     afternoonStart = [14, 0], // 下午开始时间
                                     eveningStart = [18, 30], // 晚上开始时间
                                     courseDuration = 50, // 课程持续时间
                                     breakTime = 10, // 课间休息时间
                                     bigBreakTime = 20, // 大课间休息时间
                                     bigBreakTimeAfterWhich = [2, 6], // 大课间处在第几节课之后，如果没有则为空数组
                                   } = {}) {

    let sections = [];
    let sectionCount = morningCount + afternoonCount + eveningCount;
    let date = new Date(0, 0, 0, ...morningStart);
    let hourStr = '', minuteStr = '';

    for (let section = 1; section <= sectionCount; section++) {
      hourStr = String(date.getHours());
      minuteStr = String(date.getMinutes());
      let startTime = `${hourStr.padStart(2, '0')}:${minuteStr.padStart(2,
          '0')}`;
      date.setMinutes(date.getMinutes() + courseDuration);

      hourStr = String(date.getHours());
      minuteStr = String(date.getMinutes());
      let endTime = `${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')}`;

      sections.push({
        section,
        startTime,
        endTime,
      });

      if (section === morningCount) {
        date.setHours(afternoonStart[0]);
        date.setMinutes(afternoonStart[1]);
      } else if (section === morningCount + afternoonCount) {
        date.setHours(eveningStart[0]);
        date.setMinutes(eveningStart[1]);
      } else if (bigBreakTimeAfterWhich.includes(section)) {
        date.setMinutes(date.getMinutes() + bigBreakTime);
      } else {
        date.setMinutes(date.getMinutes() + breakTime);
      }

    }

    return sections;
  }

  function getUtil() {
    class Util {
      static #parser = new DOMParser();

      static parseHTML(html) {
        return this.#parser.parseFromString(html, 'text/html');
      }

      static async load(url) {
        return fetch(url).then(r => r.text()).then(t => window.eval(t));
      }

      static async loadJQuery() {
        return this.load(
            'https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js');
      }

      static async loadLodash() {
        return this.load(
            'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js');
      }

      static async loadUnderscore() {
        return this.load(
            'https://cdn.jsdelivr.net/npm/underscore@1.13.2/underscore.js');
      }

      static async loadCryptoJS() {
        return this.load(
            'https://cdn.jsdelivr.net/npm/crypto-js@4.1.1/crypto-js.js');
      }

      static async loadPowerAssert() {
        return this.load(
            'https://cdn.jsdelivr.net/npm/power-assert@1.6.1/build/power-assert.js');
      }
    }

    return Util;
  }
}

function getErrorHandledFunction(f) {
  if (f.toString().startsWith('async')) { // 异步函数
    return async function() {
      try {
        return await f.apply(this, arguments);
      } catch (e) {
        console.error(e.stack);
        if (e.cause) {
          console.error(e.cause);
        }
        document.body.innerHTML =
            `<pre style="color: red">
出现了如下错误，请打开网页重试：
${e.stack}
${e.cause?.stack || ''}
</pre>`;
        return new Promise(() => {
        });
      }
    };
  } else {  // 常规函数
    return function() {
      try {
        return f.apply(this, arguments);
      } catch (e) {
        console.error(e.stack);
        if (e.cause) {
          console.error(e.cause);
        }
        document.body.innerHTML =
            `<pre style="color: red">
出现了如下错误，请打开网页重试：
${e.stack}
${e.cause?.stack || ''}
</pre>`;
        while (true) {
        }
      }
    };
  }
}

scheduleTimer = getErrorHandledFunction(scheduleTimer);
