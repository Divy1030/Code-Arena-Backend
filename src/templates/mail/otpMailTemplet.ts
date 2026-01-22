export const html = (otp: string) => {

    const currentDate: string = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    

    return (`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <title>Code Arena - Your OTP</title>

    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      @media only screen and (max-width: 600px) {
        .main-container {
          padding: 25px 15px 40px !important;
        }
        .content-card {
          padding: 30px 20px !important;
          margin-top: 30px !important;
        }
        .header-text {
          font-size: 22px !important;
        }
        .date-text {
          font-size: 14px !important;
        }
        .otp-container {
          margin: 30px auto !important;
          padding: 15px !important;
        }
        .otp-text {
          font-size: 30px !important;
          letter-spacing: 8px !important;
        }
        .help-text {
          max-width: 100% !important;
          padding: 0 10px !important;
        }
        .icon-container {
          width: 70px !important;
          height: 70px !important;
        }
        .social-icons {
          margin: 15px 0 !important;
        }
        .social-icon {
          width: 32px !important;
          height: 32px !important;
          margin: 0 5px !important;
        }
      }
    </style>
  </head>
  <body
    style="
      margin: 0;
      font-family: 'Inter', sans-serif;
      background: #0D1439;
      font-size: 14px;
      color: #E6E7EB;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    "
  >
    <div
      class="main-container"
      style="
        max-width: 680px;
        margin: 0 auto;
        padding: 45px 30px 60px;
        background: #0D1439;
        font-size: 14px;
        color: #E6E7EB;
      "
    >
      <header>
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            <tr>
              <td style="padding: 0;">
                <div class="header-text" style="font-size: 26px; font-weight: 700; color: #FFFFFF;">
                  <span style="color: #61DAFB;">CODE</span> ARENA
                </div>
              </td>
              <td style="text-align: right; padding: 0;">
                <span
                  class="date-text"
                  style="font-size: 16px; line-height: 30px; color: #8A91B4;"
                >${currentDate}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </header>

      <main>
        <div
          class="content-card"
          style="
            margin: 0;
            margin-top: 50px;
            padding: 50px 30px;
            background: #131C4D;
            border-radius: 16px;
            text-align: center;
            border: 1px solid #252D5A;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          "
        >
          <div style="width: 100%; max-width: 489px; margin: 0 auto;">
            <!-- Lock icon container - fixed for email compatibility -->
            <table style="margin: 0 auto; border-collapse: collapse;">
              <tr>
                <td>
                  <div 
                    class="icon-container"
                    style="
                      width: 80px; 
                      height: 80px; 
                      margin: 0 auto; 
                      background-color: rgba(97, 218, 251, 0.1); 
                      border-radius: 50%; 
                      text-align: center;
                      vertical-align: middle;
                      line-height: 80px;
                    "
                  >
                    <span style="font-size: 32px; color: #61DAFB; vertical-align: middle;">🔐</span>
                  </div>
                </td>
              </tr>
            </table>
            
            <h1
              style="
                margin: 0;
                margin-top: 25px;
                font-size: 24px;
                font-weight: 700;
                color: #FFFFFF;
              "
            >
              Verification Code
            </h1>
            <p
              style="
                margin: 0;
                margin-top: 17px;
                font-size: 16px;
                font-weight: 500;
                color: #8A91B4;
              "
            >
              Hello Developer,
            </p>
            <p
              style="
                margin: 0;
                margin-top: 17px;
                font-weight: 400;
                line-height: 1.6;
                color: #B0B7D9;
              "
            >
              Thank you for choosing <span style="font-weight: 600; color: #FFFFFF;">Code Arena</span>. 
              Use the following verification code to complete your email address change. 
              This code is valid for <span style="font-weight: 600; color: #61DAFB;">5 minutes</span> only.
            </p>
            <div
              class="otp-container"
              style="
                margin: 40px auto;
                padding: 20px;
                background: #0D1439;
                border-radius: 10px;
                border: 1px dashed #3D4673;
              "
            >
              <p
                class="otp-text"
                style="
                  margin: 0;
                  font-size: 38px;
                  font-weight: 700;
                  letter-spacing: 10px;
                  color: #61DAFB;
                  font-family: monospace;
                "
              >
                ${otp}
              </p>
            </div>
            <p style="color: #8A91B4; font-size: 13px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        </div>

        <p
          class="help-text"
          style="
            max-width: 400px;
            margin: 0 auto;
            margin-top: 40px;
            text-align: center;
            font-weight: 400;
            color: #8A91B4;
          "
        >
          Need help? Contact us at
          <a
            href="mailto:support@codearena.dev"
            style="color: #61DAFB; text-decoration: none; font-weight: 500;"
            >support@codearena.dev</a
          >
          or visit our
          <a
            href=""
            target="_blank"
            style="color: #61DAFB; text-decoration: none; font-weight: 500;"
            >Help Center</a
          >
        </p>
      </main>

      <footer
        style="
          width: 100%;
          max-width: 490px;
          margin: 30px auto 0;
          text-align: center;
          border-top: 1px solid #252D5A;
          padding-top: 30px;
        "
      >
        <p
          style="
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #FFFFFF;
          "
        >
          Code Arena
        </p>
        <p style="margin: 0; margin-top: 8px; color: #8A91B4; font-size: 13px;">
          CSIT 3rd floor, AKGEC, Ghaziabad, India
        </p>
        
        <!-- Social icons using table for better email compatibility -->
        <table class="social-icons" style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr>
            <td style="text-align: center;">
              <table style="margin: 0 auto; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="" target="_blank" style="text-decoration: none; display: inline-block;">
                      <table class="social-icon" style="width: 36px; height: 36px; border-collapse: collapse; background-color: #1E2755; border-radius: 50%;">
                        <tr>
                          <td style="text-align: center; vertical-align: middle; color: #61DAFB; font-size: 16px;">
                            f
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="" target="_blank" style="text-decoration: none; display: inline-block;">
                      <table class="social-icon" style="width: 36px; height: 36px; border-collapse: collapse; background-color: #1E2755; border-radius: 50%;">
                        <tr>
                          <td style="text-align: center; vertical-align: middle; color: #61DAFB; font-size: 16px;">
                            in
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="" target="_blank" style="text-decoration: none; display: inline-block;">
                      <table class="social-icon" style="width: 36px; height: 36px; border-collapse: collapse; background-color: #1E2755; border-radius: 50%;">
                        <tr>
                          <td style="text-align: center; vertical-align: middle; color: #61DAFB; font-size: 16px;">
                            X
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="" target="_blank" style="text-decoration: none; display: inline-block;">
                      <table class="social-icon" style="width: 36px; height: 36px; border-collapse: collapse; background-color: #1E2755; border-radius: 50%;">
                        <tr>
                          <td style="text-align: center; vertical-align: middle; color: #61DAFB; font-size: 16px;">
                            gh
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <p style="margin: 0; margin-top: 16px; color: #8A91B4; font-size: 12px;">
          © 2025 Code Arena. All rights reserved.
        </p>
      </footer>
    </div>
  </body>
</html>`
    )
}