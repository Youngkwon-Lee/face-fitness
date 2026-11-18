import XCTest

final class FaceFitnessUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        executionTimeAllowance = 90
    }
    @MainActor
    func testPracticePauseSaveRelaunchAndDelete() async throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        if app.buttons["welcome.continue"].waitForExistence(timeout: 4) {
            app.buttons["welcome.continue"].tap()
        }
        XCTAssertTrue(app.buttons["routine.daily"].waitForExistence(timeout: 5))
        attach(app, name: "01-routines")
        app.buttons["routine.daily"].tap()
        XCTAssertTrue(app.buttons["routine.start"].waitForExistence(timeout: 3))
        attach(app, name: "02-routine-detail")
        app.buttons["routine.start"].tap()
        let primary = app.buttons["workout.primary"]
        XCTAssertTrue(primary.waitForExistence(timeout: 4))
        attach(app, name: "03-practice")
        primary.tap()
        let began = expectation(description: "Practice time passes")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) { began.fulfill() }
        await fulfillment(of: [began], timeout: 4)
        primary.tap()
        XCTAssertEqual(app.staticTexts["workout.status"].label, "일시정지")
        let pausedText = app.staticTexts["workout.timer"].label
        let rest = expectation(description: "Rest time passes")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { rest.fulfill() }
        await fulfillment(of: [rest], timeout: 3)
        XCTAssertEqual(app.staticTexts["workout.timer"].label, pausedText)
        app.buttons["workout.finish"].tap()
        app.buttons["summary.save"].tap()
        XCTAssertEqual(app.staticTexts["summary.title"].label, "이 기기에 기록했어요")
        attach(app, name: "04-saved")
        app.buttons["summary.done"].tap()
        app.terminate()
        app.launch()
        app.buttons["기록"].firstMatch.tap()
        XCTAssertTrue(app.buttons["history.record"].firstMatch.waitForExistence(timeout: 4))
        attach(app, name: "05-history")
        app.buttons["설정"].firstMatch.tap()
        app.buttons["settings.privacy"].tap()
        XCTAssertTrue(app.navigationBars["개인정보 처리방침"].waitForExistence(timeout: 3))
        attach(app, name: "06-privacy")
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["settings.deleteAll"].tap()
        app.buttons["모든 기록 삭제"].tap()
        app.buttons["기록"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["아직 운동 기록이 없어요"].waitForExistence(timeout: 3))
    }

    @MainActor
    func testBackgroundPausesPracticeAndLargeTextRemainsUsable() async throws {
        let app = XCUIApplication()
        // XCTest can wait for an entire spoken cue before delivering Home.
        // Isolate immediate scene interruption from audio idleness; speech is
        // exercised by the ordinary flow; audible behavior needs a device check.
        app.launchArguments = ["--ui-testing", "-voiceCues", "NO", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        if app.buttons["welcome.continue"].waitForExistence(timeout: 3) {
            app.swipeUp()
            app.buttons["welcome.continue"].tap()
        }
        app.buttons["routine.daily"].tap()
        app.buttons["routine.start"].tap()
        let primary = app.buttons["workout.primary"]
        XCTAssertTrue(primary.waitForExistence(timeout: 4))
        primary.tap()
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5))
        XCTAssertEqual(app.staticTexts["workout.status"].label, "일시정지")
        primary.tap()
        primary.tap()
        attach(app, name: "07-accessibility-paused")
        XCTAssertTrue(primary.isHittable)
        app.buttons["workout.close"].tap()
        if app.buttons["기록하지 않고 나가기"].waitForExistence(timeout: 1) { app.buttons["기록하지 않고 나가기"].tap() }
    }

    @MainActor
    func testCameraUnavailableStillAllowsPractice() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        if app.buttons["welcome.continue"].waitForExistence(timeout: 3) { app.buttons["welcome.continue"].tap() }
        app.buttons["routine.daily"].tap()
        app.buttons["routine.start"].tap()
        app.buttons["camera.toggle"].tap()
        let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
        if permission.waitForExistence(timeout: 5) {
            let deny = permission.buttons.matching(NSPredicate(format: "identifier CONTAINS[c] %@ OR label == %@ OR label == %@ OR label == %@", "deny", "허용 안 함", "Don’t Allow", "Don't Allow")).firstMatch
            XCTAssertTrue(deny.exists, "Only the camera denial control should be handled")
            deny.tap()
        }
        let status = app.staticTexts["camera.status"]
        let fallback = NSPredicate(format: "label CONTAINS %@ OR label CONTAINS %@", "카메라 접근이 꺼져", "전면 카메라를 사용할 수 없어요")
        let ready = XCTNSPredicateExpectation(predicate: fallback, object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 6), .completed, "Actual camera state: \(status.label)")
        XCTAssertTrue(app.buttons["workout.primary"].isHittable)
        app.buttons["workout.primary"].tap()
        XCTAssertEqual(app.staticTexts["workout.status"].label, "진행 중")
        attach(app, name: "08-camera-fallback")
    }

    @MainActor
    private func attach(_ app: XCUIApplication, name: String) {
        // Snapshot after native button-title / scene activation animations settle.
        Thread.sleep(forTimeInterval: 0.6)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
