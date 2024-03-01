// NOTE: 小爱报错的行数比该文件多了9
async function scheduleHtmlProvider() {
  // 初始化
  let needLogin = 0;  // 手机端无法登录时，采取此登录方式（展示一个新的登录页面，通过ajax执行登录请求提交账号密码）
  let nameCleanPattern = /\([\w.]{6,}\)/;  // 去除课程序号等文本的正则表达式
  let semesterNames = ['1', '2', '3'];  // ajax得到的semesters数组中的学期名称，分别对应秋季，春季，夏季学期，用于获取正确的学期id
  let infersGrade = false; // 将年份转换成"大一"、"大二"等描述，目前仅适配东北大学
  let courses;
  let ids, semesters, semesterId;
  // 登录路径配置
  let loginPath = ['login.action', 'loginExt.action'][0];

  // 东北大学专用配置
  const isNEU=false;
  if (isNEU) {
    needLogin = false;
    nameCleanPattern = /\([A-Z].{6,}\)\s*$/i;
    semesterNames = ['秋季', '春季', '夏季'];
    infersGrade = true;
  }

  // 手机端无法登录时，采用新方式登录教务系统
  if (needLogin) {
    await login();
  }

  // 获取 ids, semesterId, semesters
  try {
    [ids, semesterId, semesters] = await init();
  } catch (e) {
    throw new Error('初始化失败！', {cause: e});
  }

  // 让用户选择学期并获取课表信息
  courses = await getCoursesBySemester(ids, semesterId, semesters);

  return JSON.stringify(courses);

  //获取学生id，学期id，学期信息数组
  async function init() {
    document.head.insertAdjacentHTML('beforeend',
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">`);
    document.body.style.minWidth = 0;
    document.head.insertAdjacentHTML('beforeend',
        `<base href="${location.href}"/>`);
    document.body.innerHTML = `<div style="font-size: 2em;font-weight: bold;text-align: center;">loading...</div>`;

    // 东北大学专用vpn_eval函数
    Object.assign(window, {
      vpn_eval(js) {
        if (js.match(/^\s*{(.|\n|\r)*}\s*$/))
          return window.eval(`(${js})`);
        else
          return window.eval(`{${js}}`);
      },
    });

    //加载资源，防止脚本执行时找不到依赖
    await Promise.all([
      AjaxUtil.loadJQuery(),
      AjaxUtil.loadUnderscore(),
      (async () => {
        await AjaxUtil.load(
            'static/scripts/course/TaskActivity.js');

      })(),
    ]);

    //获取学生ids
    const courseTableForStdText = await AjaxUtil.getText(
        'courseTableForStd.action');
    let ids = courseTableForStdText.match(/"ids","(\d+)"/)[1];

    //获取所有学期id和当前学期id
    const dataQueryText = await fetchFor(
        'dataQuery.action?vpn-12-o1-219.216.96.4',
        {
          method: 'post',
          body: new URLSearchParams({
            dataType: 'semesterCalendar',
          }),
          checkResult: t => {
            const {semesters} = window.eval(`(${t})`);
            return Object.keys(semesters).length > 0;
          },
        });
    const semestersObj = window.eval(`(${dataQueryText})`).semesters;
    const semesters = Object.values(semestersObj).flat();

    semesterId = findCurrentSemesterId(semesters);

    return [ids, semesterId, semesters];
  }

  //选择学期，返回课表信息
  async function getCoursesBySemester(ids, defaultSemesterId, semesters) {
    return new Promise(async resolve => {
      //更新页面，查询元素
      let options = await generateOptions(semesters, defaultSemesterId);
      showSelectPage(options);
      let $semesterSelect = $('#semesterSelect');
      let $confirmBtn = $('#confirmBtn');
      let $switchButtons = $('#prevBtn,#nextBtn');
      let $allButtons = $('div.btn-group button');
      let $tip = $('div.tip');
      let $table = $('div.table-content table');

      //处理确认按钮事件
      let clickHandler = async function() {
        $(this).text('导入中...');
        $semesterSelect.add($allButtons).prop('disabled', true);
        let courses = $('#semesterSelect option:selected').data('courses');
        resolve(courses);
      };
      $confirmBtn.on('click', getErrorHandledFunction(clickHandler));

      //处理学期更改事件
      let changeHandler = async () => {
        $semesterSelect.add($allButtons).prop('disabled', true);
        $tip.text('loading...');
        $table.hide();

        let $selectedOption = $('#semesterSelect option:selected');
        let courses = $selectedOption.data('courses');

        if (courses === null) {     //无课表信息
          $tip.text('所选学期无课程信息！');
        } else if (courses !== undefined) {    //已获取课表信息
          $tip.text('');
          $table.find('tbody').html(generateTableHtml($selectedOption));
          $table.show();
          $confirmBtn.prop('disabled', false);
        } else {                                                   //未获取课表信息
          await loadOptionCourses(ids, $selectedOption);
          $semesterSelect.trigger('change');
        }

        $semesterSelect.add($switchButtons).prop('disabled', false);
      };
      $semesterSelect.on('change', getErrorHandledFunction(changeHandler));

      //加载当前学期
      await getErrorHandledFunction(changeHandler)();

      //缓存其他学期课表
      let $selectedOption = $semesterSelect.find('option:selected');
      cacheCourses(ids, $selectedOption);
    });

    //进入学期选择页面
    function showSelectPage(options) {
      document.write(
          `<!DOCTYPE html> <html lang="en"> <head>   <meta charset="UTF-8">   <title>导入课表</title>   <meta content="width=device-width, initial-scale=1.0" name="viewport">   <style>     body {       min-width: 0;     }      div.content {       text-align: center;       margin-bottom: 30vh;     }      fieldset {       width: 75vw;       margin: 0 auto;     }      fieldset legend {       font-size: 1.25em;     }      div.semesters {       padding: .5em;     }      div.semesters select, div.btn-group button {       text-align: center;       padding: .2em .3em;     }      div.btn-group button {       margin: .5em .5em;     }      div.tip {       color: blue;     }      div.tip, div.table-content {       margin: 3vh 0;     }      table {       border-collapse: collapse;       margin: 0 auto;       width: 95%;     }      table caption {       padding: .5em;       font-size: 1.25em;     }      table col:nth-child(1) {       width: 4em;     }      table col:nth-child(3) {       width: 8em;     }      table th, table td {       border: 1px solid;       padding: .2em .3em;       text-align: center;     }    </style> </head> <body>  <div class="content">   <fieldset>     <legend>请选择学期</legend>     <div class="semesters">       <select id="semesterSelect">       </select>     </div>     <div class="btn-group">       <button id="prevBtn">&lt;&lt; 上学期</button>       <button id="confirmBtn">确认导入</button>       <button id="nextBtn">下学期 &gt;&gt;</button>     </div>   </fieldset>    <div class="tip">所选学期无课程信息！</div>    <div class="table-content">     <table>       <caption>课表预览</caption>       <colgroup>         <col>         <col>         <col>       </colgroup>       <thead>       <tr>         <th>           序号         </th>         <th>           课程名称         </th>         <th>           任课教师         </th>       </tr>       </thead>       <tbody>       </tbody>     </table>   </div> </div>  </body> </html>`);
      document.close();

      //添加生成的options
      $('#semesterSelect').html(options);

      //处理学期切换按钮的事件
      $('#prevBtn,#nextBtn').on('click', function() {

        let dir = this.id.slice(0, 4);
        $('option:selected')[dir]().prop('selected', true);
        $('#semesterSelect').trigger('change');
      });

    }

    //生成下拉选项
    async function generateOptions(semesters, defaultSemesterId) {
      let options = '';
      if (infersGrade) {
        let admissionYear = await queryAdmissionYear();
        semesters.forEach(semester => {
          let year = parseInt(semester.schoolYear);
          if (year >= admissionYear - 1 && year <= admissionYear + 5) {   //大一前一年到大六
            options += `<option value="${semester.id}" ${semester.id ===
            defaultSemesterId ? 'selected' : ''}>`;
            let semesterName = getSemesterName(admissionYear,
                semester.schoolYear,
                semester.name);
            options += `${semesterName ?? semester.schoolYear + ' ' +
            semester.name}`;
            options += `</option>`;
          }
        });
      } else {
        let currentYear = new Date().getFullYear();
        semesters.forEach(semester => {
          let year = parseInt(semester.schoolYear);
          if (year >= currentYear - 5 && year <= currentYear + 1) {   //前5年和未来一年
            options += `<option value="${semester.id}" ${semester.id ===
            defaultSemesterId ? 'selected' : ''}>`;
            options += `${semester.schoolYear + ' ' + semester.name}`;
            options += `</option>`;
          }
        });
      }

      return options;

      //根据入学年份，当前学年学期，返回当前学期的名字，大一到大四以外的范围返回null
      function getSemesterName(admissionYear, yearName, semesterName) {
        let grades = ['大一', '大二', '大三', '大四'];
        let semesterNameMap = new Map(
            [
              [semesterNames[0], '上学期'],
              [semesterNames[1], '下学期'],
              [semesterNames[2], '小学期']]);
        let year = parseInt(yearName);
        let gradeIndex = year - admissionYear;
        if (gradeIndex in grades && semesterNameMap.has(semesterName))
          return grades[year - admissionYear] + ' ' +
              semesterNameMap.get(semesterName);
        return null;
      }

      //查询入学年份
      async function queryAdmissionYear() {
        let homeHtml = await fetchFor('homeExt.action', {
          checkResult: t => t.includes('personal-list'),
        });

        let homeDoc = AjaxUtil.parseHTML(homeHtml);
        let username = $('.personal-list', homeDoc).
            text();
        return +username.match(/\d{4}/)[0];
      }
    }

    //生成tbody的html内容
    function generateTableHtml($selectedOption) {
      let courses = $selectedOption.data('courses');
      let html = $selectedOption.data('tableHtml');
      if (html) {   //之前生成过
        return html;
      }

      //重新生成
      let uniqueCourses = getUniqueCourses(courses);
      html = '';
      uniqueCourses.forEach((course, index) => {
        let name = course.name;
        let teacher = course.teacher;
        html +=
            `<tr><td>${index + 1}</td><td>${name}</td><td>${teacher}</td></tr>`;
      });

      $selectedOption.data('tableHtml', html);
      return html;

      //过滤重复课程，并按课程名称长度排序
      function getUniqueCourses(courses) {
        let set = new Set();
        return courses.filter(course => {
          if (set.has(course.name))
            return false;
          set.add(course.name);
          return true;
        }).sort((a, b) => {
          return a.name.length - b.name.length;
        });
      }
    }

    //在后台缓存其他学期的信息，不进行异常捕获
    function cacheCourses(ids, $selectedOption) {
      let batch = 4;
      let tasks = [];

      setTimeout(async () => {
        let prevOption = $selectedOption.prev();
        let nextOption = $selectedOption.next();
        while (prevOption.length || nextOption.length) {
          if (prevOption.length && nextOption.length) {   //一次性加入两个缓存任务
            tasks.push(loadOptionCourses(ids, prevOption),
                loadOptionCourses(ids, nextOption));
          } else if (prevOption.length) {
            tasks.push(loadOptionCourses(ids, prevOption));
            prevOption = prevOption.prev();
            if (prevOption.length)
              tasks.push(loadOptionCourses(ids, prevOption));
          } else {
            tasks.push(loadOptionCourses(ids, nextOption));
            nextOption = nextOption.next();
            if (nextOption.length)
              tasks.push(loadOptionCourses(ids, nextOption));
          }
          if (tasks.length >= batch) {  //任务数量超出上限，等待全部完成
            await Promise.all(tasks);
            tasks.length = 0;
          }
          prevOption = prevOption.prev();
          nextOption = nextOption.next();
        }
      });
    }

    //加载某个option元素的课程数据
    async function loadOptionCourses(ids, $option) {
      if (!$option.length)
        return;
      let selectedId = $option.val();
      // let urls = await queryCourseUrls(ids, selectedId);
      let url = `courseTableForStd!courseTable.action?setting.kind=std&semester.id=${selectedId}&ids=${ids}`;
      let isOptionLoaded = () => $option.data('courses') !== undefined;

      let courses = await querySemesterCourses(url, isOptionLoaded);

      if (courses === null) { //查询中途已经加载完成
        return;
      }

      if (!courses.length) {
        courses = null;
      }

      $option.data('courses', courses);
    }

    /**
     * 查询该学期的所有课程信息
     * @param url 某学期学期的课表页面
     * @param isOptionLoaded 判断当前学期是否在后台加载完成
     * @returns 课表结果。如果后台已加载完成，返回null
     */
    async function querySemesterCourses(url, isOptionLoaded) {
      let courses = [];
      try {
        courses = await queryCoursesOnPage(url, isOptionLoaded);
      } catch (e) {
        if (e.message === 'loaded') {
          return null;
        } else {
          throw e;
        }
      }

      return courses;
    }

    /**
     * 获取指定url页面上的课程信息
     * @param url 某学期学期的课表页面
     * @param isOptionLoaded 判断当前学期是否在后台加载完成
     * @returns 课表结果。如果后台已加载完成，抛出异常(message为loaded)
     */
    async function queryCoursesOnPage(url, isOptionLoaded) {
      let t = await fetchFor(url, {
        checkResult: t => isOptionLoaded() || t.includes('new CourseTable'),
      });
      if (isOptionLoaded())
        throw new Error('loaded');

      let js = $('script:contains(new CourseTable)',
          AjaxUtil.parseHTML(t)).text();
      window.eval(js);
      /*
            //在学期课表页面课表对象是table0，在课程课表页面则是table
            let activities = window.table ? table.activities : table0.activities;
      */

      return getCoursesFromActivities(table0.activities);

      //转换成小爱课表的格式
      function getCoursesFromActivities(activities) {
        let courses = [];
        activities.forEach((cours, index) => {
          if (!cours.length) return;
          let [day, sec] = getDayAndSec(index, unitCount);
          cours.forEach(cour => {
            courses.push({
              'name': cour.courseName.replace(nameCleanPattern, ''),
              'position': cour.roomName,
              'teacher': cour.teacherName,
              'day': day,
              'sections': [sec],
              'weeks': cour.vaildWeeks.split('').map((s, i) => {
                if (s === '1')
                  return i;
                else
                  return null;
              }).filter(n => n !== null),
            });
          });
        });
        return courses;

        //根据课程索引，计算星期数和节数
        function getDayAndSec(index, unitCount) {
          let day = parseInt(index / unitCount) + 1;
          let sec = index % unitCount + 1;
          return [day, sec];
        }
      }
    }

  }

  //在修复好的登录表单登录
  async function login() {
    document.head.insertAdjacentHTML('beforeend',
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">`);
    document.body.style.minWidth = 0;
    document.body.innerHTML = `<h1 style="text-align: center">loading...</h1>`;

    await Promise.all([
      AjaxUtil.loadJQuery(),
      AjaxUtil.loadCryptoJS()]);

    if (!await isLoggedIn()) {
      showLoginPage();
      while (!await doLogin()) {
      }
    }

    async function isLoggedIn() {
      let r = await fetch(loginPath);
      return r.url.includes('home');
    }

    async function doLogin() {
      const loginHtml = await fetchFor(loginPath, {
        checkResult: t => $('#loginForm', t).length,
      });
      const loginDoc = AjaxUtil.parseHTML(loginHtml);

      // 显示验证码输入框
      if (needCaptcha(loginDoc)) {
        $('#captchaField').show();
        $('img.captcha').trigger('click');
      }

      const loginForm = $('#loginForm')[0];
      const $submitBtn = $('#submitBtn');

      //ajax登录
      $submitBtn.off('click');
      return new Promise(async (resolve) => {
        $submitBtn.on('click', async (event) => {
          event.preventDefault();
          // 对密码进行加密
          const $password = $('#password');
          let password = $password.val();
          password = CryptoJS.SHA1(getKey(loginHtml) + password);
          $password.val(password);

          const response = await fetch(loginPath, {
            body: new FormData(loginForm),
            method: 'post',
          });

          const respDoc = AjaxUtil.parseHTML(await response.text());
          const errorText = $('div.actionError', respDoc).text().trim();
          $('#resp').text(errorText);
          loginForm.reset();
          resolve(response.url.includes('home'));
        });

      });

    }

    function getKey(loginHtml) {
      return loginHtml.match(/CryptoJS.SHA1\('(.*?)'/)[1];
    }

    function needCaptcha(loginDoc) {
      return $('input[name="captcha_response"]', loginDoc).length > 0;
    }

    function showLoginPage() {
      document.write(
          `<!DOCTYPE html> <html lang="en"> <head>   <meta charset="UTF-8">   <title>教务系统登录</title>   <meta content="width=device-width, initial-scale=1.0" name="viewport">   <script>     function refreshCaptcha(img) {       img.src = 'captcha/image.action?d=' + Date.now();     }   </script>   <style>     body {       min-width: 0;     }      div.content {       margin-top: 2em;       text-align: center;     }      #resp {       color: red;     }      form div {       margin: .5em auto;     }      label {       display: inline-block;       width: 4em;       padding-right: 1em;       position: relative;       text-align: justify;     }      label::after {       content: "：";       position: absolute;       right: 0;     }      form div > input:nth-child(2) {       width: 10em;     }      div.captcha-img {       width: 15em;     }      img.captcha {       width: 7em;       height: 2.5em;       margin-top: .2em;       margin-right: .3em;       float: left;       cursor: pointer;     }      span.captcha-tip {       font-size: .6em;       opacity: .5;     }      input[type="submit"] {       clear: both;       margin-top: .5em;     }      #captchaField {       display: none;     }    </style> </head> <body> <div class="content">   <div id="resp"></div>   <form id="loginForm">     <div>       <label for="username">用户名</label>       <input id="username" name="username" type="text">     </div>     <div>       <label for="password">密&nbsp;&nbsp;&nbsp;&nbsp;码</label>       <input id="password" name="password" type="password">     </div>     <div id="captchaField">       <div>         <label for="captcha_response">验证码</label>         <input id="captcha_response" name="captcha_response" type="text">       </div>       <div class="captcha-img">         <img class="captcha" onclick="refreshCaptcha(this);"              src="captcha/image.action">         <span class="captcha-tip">如果验证码无法输入，可以清除小爱数据后再尝试</span>       </div>     </div>     <div>       <input id="submitBtn" type="submit" value="登录">     </div>   </form> </div>  </body> </html>`);
      document.close();
    }
  }

  /**
   * 不断尝试fetch直到满足条件
   * @param input 请求的url
   * @param init 其中的checkResult()函数，接受responseText作为参数，返回true/false，
   *             用来决定是否结束fetch操作
   * @returns responseText。如果超时，抛出异常。
   */
  async function fetchFor(input, init) {
    let attempts = 0;
    let checkResult = init?.checkResult ?? (() => true);
    delete init?.checkResult;

    while (true) {
      let responseText = await fetch(input, init).then(r => r.text());
      if (checkResult(responseText))
        return responseText;

      if (++attempts > 15) {
        throw new Error('请求超时！');
      } else {
        await new Promise((r) => {
          setTimeout(r, attempts * 200);
        });
      }
    }
  }

  //根据当前时间，查找semesters中对应的学期id，不考虑夏季小学期
  function findCurrentSemesterId(semesters) {
    let now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    let schoolYear, name;                   //从semesters中查询id需要的字符串

    if (2 <= month && month <= 7) {         //春季学期
      schoolYear = `${year - 1}-${year}`;
      name = semesterNames[1];
    } else if (month === 1) {               //秋季学期
      schoolYear = `${year - 1}-${year}`;
      name = semesterNames[0];
    } else {
      schoolYear = `${year}-${year + 1}`;   //秋季学期
      name = semesterNames[0];
    }

    return semesters.find(semester => {
      return semester.schoolYear === schoolYear && semester.name === name;
    })?.id;
  }

}

class AjaxUtil {
  static #parser = new DOMParser();

  // 解析html为document对象
  static parseHTML(html, type = 'text/html') {
    return this.#parser.parseFromString(html, type);
  }

  static async getText(url) {
    return fetch(url).then(r => r.text());
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

scheduleHtmlProvider = getErrorHandledFunction(scheduleHtmlProvider);
